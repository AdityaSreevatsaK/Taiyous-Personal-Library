import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as libraryApi } from '../functions/api/library';
import { onRequest as ownerApi } from '../functions/api/owner';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';
import { commit } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({ uploadFiles:vi.fn(), commit:vi.fn() }));
const id = 'abcdefabcdefabcdefabcdef';
const otherId = '111111111111111111111111';
const sha = 'a'.repeat(40);
const passphrase = 'A-Long-Independent-Publication-Owner-Password';
const env = { HF_OAUTH_SESSION_KEY:'31'.repeat(32), TAIYOU_OWNER_PASSPHRASE:passphrase };
const session = { access:'hf_'+'a'.repeat(30), username:'AdityaSreevatsaK', expires:Date.now()+3_600_000 };
const catalogue = { version:1, books:[
  { id, metadata:{ id, title:'Great Doctor Ling Ran', author:'Village Of Ambitious Birds',
      status:'Ongoing', progress:0, completedAt:undefined, personalRating:8,
      sourceTags:['Comedy','Slice of Life'], personalTags:['System'] },
    epubPath:'data/novels/'+id+'/source.epub', coverPath:'data/novels/'+id+'/cover.jpg',
    archivePath:'data/novels/'+id+'/original.zip' },
  { id:otherId, metadata:{ id:otherId, title:'Another novel', status:'Hiatus' },
    epubPath:'data/novels/'+otherId+'/source.epub' },
] };
async function cookies(unlock = true):Promise<string> {
  const sessionCookieValue = await sessionCookie(session, env);
  if (!unlock) return sessionCookieValue;
  const response = await ownerApi({request:new Request(PUBLIC_ORIGIN+'/api/owner?action=unlock', {
    method:'POST',headers:{Cookie:sessionCookieValue,Origin:PUBLIC_ORIGIN,
      'X-Taiyou-Request':'owner-mode','Content-Type':'application/json'},
    body:JSON.stringify({passphrase}),
  }),env});
  expect(response.status).toBe(200);
  return sessionCookieValue+'; '+response.headers.get('Set-Cookie')!.split(';')[0];
}
async function edit(cookie:string, updates:Record<string,unknown>={},
    origin=PUBLIC_ORIGIN,marker='owner-edit-publication-status') {
  return libraryApi({request:new Request(PUBLIC_ORIGIN+'/api/library?action=correct-publication-status', {
    method:'POST',headers:{Cookie:cookie,Origin:origin,
      'X-Taiyou-Request':marker,'Content-Type':'application/json'},
    body:JSON.stringify({id,expectedStatus:'Ongoing',status:'Completed',...updates}),
  }),env});
}
function fakeDataset(data:unknown=catalogue) {
  vi.stubGlobal('fetch',vi.fn(async (input:RequestInfo | URL) => {
    const url=String(input);
    if (url.endsWith('/api/datasets/AdityaSreevatsaK/Taiyous-Novels'))
      return new Response(JSON.stringify({sha,private:true}),{status:200});
    if (url.endsWith('/resolve/'+sha+'/data/library.json'))
      return new Response(JSON.stringify(data),{status:200});
    throw Error('Unexpected publication gateway request '+url);
  }));
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
describe('Owner-only publication status correction',()=>{
  it('rejects readers without Owner unlock, forged Origin and forged request marker',async()=>{
    expect((await edit('')).status).toBe(401);
    expect((await edit(await cookies(false))).status).toBe(403);
    const own=await cookies();
    expect((await edit(own,{},'https://evil.example')).status).toBe(403);
    expect((await edit(own,{},PUBLIC_ORIGIN,'owner-edit-metadata')).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
  it('commits only the publication status using the inspected SHA, never reading state',async()=>{
    const own=await cookies();
    fakeDataset();
    vi.mocked(commit).mockResolvedValue(undefined);
    const result=await edit(own);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({saved:true,id,status:'Completed'});
    expect(commit).toHaveBeenCalledTimes(1);
    const args=vi.mocked(commit).mock.calls[0][0];
    expect(args.parentCommit).toBe(sha);
    expect(args.operations).toHaveLength(1);
    const op=args.operations[0];
    expect(op.path).toBe('data/library.json');
    if (op.operation!=='addOrUpdate'||!(op.content instanceof Blob))throw Error('Expected catalogue-only write');
    const updated=JSON.parse(await op.content.text());
    expect(updated.books[0].metadata).toEqual({...catalogue.books[0].metadata,status:'Completed'});
    for (const prop of ['id','epubPath','archivePath','coverPath'])
      expect(updated.books[0][prop]).toBe(catalogue.books[0][prop]);
    expect(updated.books[1]).toEqual(catalogue.books[1]);
  });
  it('rejects stale statuses, unsupported labels, invalid IDs and oversized values',async()=>{
    const own=await cookies();
    fakeDataset();
    for (const update of [
      {expectedStatus:'Completed'},{expectedStatus:'Hiatus'},
      {status:'Finished'},{status:'updating'}, {status:'Unknown'}, {status:''},
      {id:'0'.repeat(24)},{id:'not-an-id'},{expectedStatus:'x'.repeat(151)},
    ]) {
      const response=await edit(own,update);
      expect([400,409]).toContain(response.status);
    }
    expect(commit).not.toHaveBeenCalled();
  });
  it('supports legacy records with an initially absent status',async()=>{
    const own=await cookies();
    const legacy=JSON.parse(JSON.stringify(catalogue));
    delete legacy.books[0].metadata.status;
    fakeDataset(legacy);
    vi.mocked(commit).mockResolvedValue(undefined);
    const result=await edit(own,{expectedStatus:'',status:'Hiatus'});
    expect(result.status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('does not write when status is unchanged, or when the HF parent revision conflicts',async()=>{
    const own=await cookies();
    fakeDataset();
    expect((await edit(own,{status:'Ongoing'})).status).toBe(200);
    expect(commit).not.toHaveBeenCalled();
    vi.mocked(commit).mockRejectedValue(new Error('409 concurrent update'));
    expect((await edit(own,{status:'Dropped'})).status).toBe(409);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

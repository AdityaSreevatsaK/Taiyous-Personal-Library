import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as libraryApi } from '../functions/api/library';
import { onRequest as ownerApi } from '../functions/api/owner';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';
import { commit } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({ uploadFiles:vi.fn(), commit:vi.fn() }));

const id='abcdefabcdefabcdefabcdef';
const otherId='111111111111111111111111';
const phrase='A-Long-Independent-Metadata-Owner-Password';
const sha='a'.repeat(40);
const env={ HF_OAUTH_SESSION_KEY:'31'.repeat(32), TAIYOU_OWNER_PASSPHRASE:phrase };
const session={ access:'hf_'+'a'.repeat(30), username:'AdityaSreevatsaK',
  expires:Date.now()+3_600_000 };
const catalogue={
  version:1,
  books:[
    { id, metadata:{id,title:'Abe the Wizard',author:'Original Author',progress:5},
      epubPath:'data/novels/'+id+'/source.epub',coverPath:'data/novels/'+id+'/cover.jpg',
      archivePath:'data/novels/'+id+'/original.zip' },
    { id:otherId, metadata:{id:otherId,title:'Different Book',author:'Other Writer'},
      epubPath:'data/novels/'+otherId+'/source.epub' },
  ],
};

async function cookies(unlock=true):Promise<string> {
  const sessionCookieValue=await sessionCookie(session,env);
  if (!unlock) return sessionCookieValue;
  const response=await ownerApi({
    request:new Request(PUBLIC_ORIGIN+'/api/owner?action=unlock',{
      method:'POST',headers:{Cookie:sessionCookieValue,Origin:PUBLIC_ORIGIN,
        'X-Taiyou-Request':'owner-mode','Content-Type':'application/json'},
      body:JSON.stringify({passphrase:phrase}),
    }),env,
  });
  expect(response.status).toBe(200);
  return sessionCookieValue+'; '+response.headers.get('Set-Cookie')!.split(';')[0];
}
async function edit(cookie:string, updates:Record<string,unknown>={},
   origin=PUBLIC_ORIGIN,marker='owner-edit-metadata') {
  return libraryApi({ request:new Request(PUBLIC_ORIGIN+'/api/library?action=correct-metadata',{
    method:'POST',headers:{Cookie:cookie,Origin:origin,
      'X-Taiyou-Request':marker,'Content-Type':'application/json'},
    body:JSON.stringify({id,expectedTitle:'Abe the Wizard',
      title:'Abe the Wizard: Corrected',author:'Correct Writer',...updates}),
  }),env });
}
function fakeDataset() {
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    const url=String(input);
    if (url.endsWith('/api/datasets/AdityaSreevatsaK/Taiyous-Novels'))
      return new Response(JSON.stringify({sha,private:true}),{status:200});
    if (url.endsWith('/resolve/'+sha+'/data/library.json'))
      return new Response(JSON.stringify(catalogue),{status:200});
    throw Error('Unexpected metadata gateway fetch: '+url);
  }));
}
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});

describe('Master Controls owner-only catalogue metadata corrections',()=>{
  it('blocks public requests, logged-in readers without Owner unlock, forged origin/marker',async()=>{
    expect((await edit('')).status).toBe(401);
    expect((await edit(await cookies(false))).status).toBe(403);
    const own=await cookies();
    expect((await edit(own,{},'https://evil.example')).status).toBe(403);
    expect((await edit(own,{},PUBLIC_ORIGIN,'dataset-upload')).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
  it('commits exactly one revision-bound library.json correction, preserving IDs and file paths',async()=>{
    const own=await cookies();
    fakeDataset();
    vi.mocked(commit).mockResolvedValue(undefined);
    const res=await edit(own);
    expect(res.status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
    const args=vi.mocked(commit).mock.calls[0][0];
    expect(args.parentCommit).toBe(sha);
    expect(args.operations).toHaveLength(1);
    const op=args.operations[0];
    expect(op.path).toBe('data/library.json');
    if(op.operation!=='addOrUpdate'||!(op.content instanceof Blob))throw Error('Expected catalogue-only write');
    const updated=JSON.parse(await op.content.text());
    expect(updated.books[0].id).toBe(id);
    expect(updated.books[0].epubPath).toBe(catalogue.books[0].epubPath);
    expect(updated.books[0].archivePath).toBe(catalogue.books[0].archivePath);
    expect(updated.books[0].coverPath).toBe(catalogue.books[0].coverPath);
    expect(updated.books[0].metadata).toEqual({
      ...catalogue.books[0].metadata,title:'Abe the Wizard: Corrected',author:'Correct Writer',
    });
    expect(updated.books[1]).toEqual(catalogue.books[1]);
  });
  it('rejects stale title, unknown ID, collisions and blank replacements',async()=>{
    const own=await cookies();
    fakeDataset();
    for(const changes of [
      {expectedTitle:'Older title'},{id:'0'.repeat(24)},
      {title:'Different Book',author:'Other Writer'},
      {title:''},{author:''},
    ]) {
      const res=await edit(own,changes);
      expect([400,409]).toContain(res.status);
    }
    expect(commit).not.toHaveBeenCalled();
  });
  it('fails closed on concurrent changes, leaving original private data untouched',async()=>{
    const own=await cookies();
    fakeDataset();
    vi.mocked(commit).mockRejectedValue(new Error('409 concurrent update'));
    expect((await edit(own)).status).toBe(409);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

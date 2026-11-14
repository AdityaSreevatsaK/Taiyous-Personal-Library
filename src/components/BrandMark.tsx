/** App identity asset: replace public/branding/taiyou-mark.svg when approved. */
export default function BrandMark({ size = 21 }: { size?: number }) {
  return <img className="taiyou-brand-mark" src="/branding/taiyou-mark.svg"
    width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

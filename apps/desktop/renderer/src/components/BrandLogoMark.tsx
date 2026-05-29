import logoIcon from "@renderer/assets/bakiyedefter-logo-icon.png";

type BrandLogoMarkProps = {
  size?: "tiny" | "small" | "regular" | "large";
};

export function BrandLogoMark({ size = "regular" }: BrandLogoMarkProps) {
  return <img className={`brand-logo-mark brand-logo-mark--${size}`} src={logoIcon} alt="" aria-hidden="true" draggable={false} />;
}

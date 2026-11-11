import { CommandCenter } from "@/components/command-center";

export default function Page() {
  return <CommandCenter studioLicenseKey={process.env.AG_STUDIO_LICENSE_KEY} />;
}

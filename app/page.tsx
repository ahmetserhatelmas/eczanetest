import MapShell from "@/components/MapShell";
import { getHomeBlogTeaser } from "@/lib/blog-queries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const homeBlogTeaser = await getHomeBlogTeaser();
  return <MapShell homeBlogTeaser={homeBlogTeaser} />;
}

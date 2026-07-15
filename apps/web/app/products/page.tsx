import { redirect } from "next/navigation";

interface ProductsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const resolvedParams = await searchParams;
  const queryString = new URLSearchParams(resolvedParams as Record<string, string>).toString();
  redirect(`/cake-catalogue${queryString ? `?${queryString}` : ""}`);
}

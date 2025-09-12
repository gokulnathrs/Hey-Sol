export async function fetchMetadata(uri: string): Promise<any | null> {
  try {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.statusText}`);
    return await res.json();
  } catch (err: any) {
    console.error("❌ Metadata fetch error:", err.message);
    return null;
  }
}
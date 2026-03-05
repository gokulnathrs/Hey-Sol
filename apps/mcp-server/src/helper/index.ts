export async function fetchMetadata(uri: string): Promise<any | null> {
  try {
    if (!uri) return null;

    // Handle IPFS URLs
    if (uri.startsWith("ipfs://")) {
      const ipfsHash = uri.replace("ipfs://", "");
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;
      const res = await fetch(gatewayUrl);
      if (!res.ok) throw new Error(`Failed to fetch from IPFS: ${res.statusText}`);
      return await res.json();
    }

    // Handle direct HTTP(S) URLs
    if (uri.startsWith("http")) {
      const res = await fetch(uri);
      if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.statusText}`);
      return await res.json();
    }

    return null;
  } catch (err: any) {
    console.error("❌ Metadata fetch error:", err.message);
    return null;
  }
}

/**
 * Fetch active NFT listings from marketplace (supports mainnet and devnet)
 */
export async function fetchMagicEdenListings(collectionSymbol: string, limit: number = 20) {
  // Devnet: Use mock data
  if (process.env.MODE === "devnet") {
    const { generateMockListings } = await import("../mock-data.js");
    return generateMockListings(collectionSymbol, limit);
  }

  // Mainnet: Fetch from Magic Eden
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/listings?limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch Magic Eden listings for ${collectionSymbol}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching Magic Eden listings:", error);
    return [];
  }
}
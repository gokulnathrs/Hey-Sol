/**
 * Mock NFT Data Provider for Devnet Testing
 * Provides realistic NFT collections, listings, and market data for demo purposes
 */
/**
 * Mock NFT Collections Database for Devnet
 * Simulates popular Solana NFT collections with realistic metrics
 */
export const MOCK_NFT_COLLECTIONS = [
    {
        symbol: "degenapes",
        name: "Degen Apes (Devnet)",
        image: "https://i.seadn.io/gcs/v0-e2405566fab10a98b1b86d3b30e85ee5.png",
        description: "Premium ape collection on devnet for testing",
        verified: true,
        floorPrice: 5.2,
        volume24h: 145.8,
        volume7d: 892.3,
        floorPrice24h: 4.9,
        floorPrice7d: 4.5,
        listedCount: 42,
        totalItems: 500,
        twitter: "https://twitter.com/degenapes",
    },
    {
        symbol: "pixelheroes",
        name: "Pixel Heroes (Devnet)",
        image: "https://i.seadn.io/gcs/v0-1f4c5f2e8c8f8f2e1f4c5f2e8c8f8f2e.png",
        description: "Retro pixel art heroes collection",
        verified: true,
        floorPrice: 2.1,
        volume24h: 98.5,
        volume7d: 567.2,
        floorPrice24h: 2.0,
        floorPrice7d: 1.95,
        listedCount: 156,
        totalItems: 1000,
        twitter: "https://twitter.com/pixelheroes",
    },
    {
        symbol: "catworld",
        name: "Cat World (Devnet)",
        image: "https://i.seadn.io/gcs/v0-3e7f2b1a9c4d5e6f7g8h9i0j1k2l3m4n.png",
        description: "Cute cat NFT collection for the community",
        verified: false,
        floorPrice: 0.8,
        volume24h: 42.3,
        volume7d: 234.1,
        floorPrice24h: 0.75,
        floorPrice7d: 0.7,
        listedCount: 234,
        totalItems: 2500,
        twitter: "https://twitter.com/catworld",
        discord: "https://discord.gg/catworld",
    },
    {
        symbol: "solwarriors",
        name: "Sol Warriors (Devnet)",
        image: "https://i.seadn.io/gcs/v0-5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w.png",
        description: "Battle-ready warrior NFTs with utilities",
        verified: true,
        floorPrice: 3.5,
        volume24h: 156.2,
        volume7d: 1023.4,
        floorPrice24h: 3.2,
        floorPrice7d: 3.0,
        listedCount: 89,
        totalItems: 800,
        twitter: "https://twitter.com/solwarriors",
        website: "https://solwarriors.com",
    },
    {
        symbol: "neonpunks",
        name: "Neon Punks (Devnet)",
        image: "https://i.seadn.io/gcs/v0-7x8y9z0a1b2c3d4e5f6g7h8i9j0k1l2m.png",
        description: "Cyberpunk aesthetic pixel art",
        verified: true,
        floorPrice: 12.5,
        volume24h: 234.7,
        volume7d: 1567.8,
        floorPrice24h: 11.8,
        floorPrice7d: 10.2,
        listedCount: 25,
        totalItems: 333,
        twitter: "https://twitter.com/neonpunks",
    },
];
/**
 * Generate mock NFT listings for a collection
 */
export function generateMockListings(collectionSymbol, limit = 20) {
    const collection = MOCK_NFT_COLLECTIONS.find(c => c.symbol === collectionSymbol);
    if (!collection)
        return [];
    const listings = [];
    const basePrice = collection.floorPrice;
    // Generate 'limit' listings with varying prices
    for (let i = 0; i < Math.min(limit, collection.listedCount); i++) {
        const priceVariation = 1 + (Math.random() - 0.5) * 0.15; // ±7.5%
        listings.push({
            mint: `${collectionSymbol}_nft_${String(i).padStart(4, "0")}`,
            collectionSymbol,
            price: parseFloat((basePrice * priceVariation).toFixed(2)),
            title: `${collection.name} #${i + 1}`,
            sellerAddress: generateMockAddress(),
            makerBoard: "",
            image: collection.image,
            available: true,
            attributes: generateMockAttributes(),
        });
    }
    return listings;
}
/**
 * Generate mock attributes for an NFT
 */
function generateMockAttributes() {
    const attributes = [
        "Rare",
        "Legendary",
        "Common",
        "Uncommon",
        "Special",
        "Golden",
        "Dark",
        "Glowing",
        "Ancient",
    ];
    const count = Math.floor(Math.random() * 3) + 1;
    return attributes.slice(0, count);
}
/**
 * Generate a random mock Solana address (for seller)
 */
function generateMockAddress() {
    const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let address = "";
    for (let i = 0; i < 44; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
}
/**
 * Get trending collections (mock version for devnet)
 */
export function getMockTrendingCollections(limit = 10) {
    // Shuffle and return top collections
    const shuffled = [...MOCK_NFT_COLLECTIONS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(limit, shuffled.length));
}
/**
 * Get collection stats (mock version)
 */
export function getMockCollectionStats(collectionSymbol) {
    return MOCK_NFT_COLLECTIONS.find(c => c.symbol === collectionSymbol) || null;
}
/**
 * Search mock collections by name or symbol
 */
export function searchMockCollections(query) {
    const lowerQuery = query.toLowerCase();
    return MOCK_NFT_COLLECTIONS.filter(c => c.name.toLowerCase().includes(lowerQuery) || c.symbol.toLowerCase().includes(lowerQuery));
}

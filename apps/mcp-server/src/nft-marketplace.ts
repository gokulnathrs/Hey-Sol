/**
 * Real NFT Marketplace Integration with Devnet/Mainnet Support
 * Handles Magic Eden (mainnet) and Mock Data (devnet)
 */

import { isMainnet, isDevnet } from "./mode.js";
import { 
  getMockTrendingCollections, 
  getMockCollectionStats, 
  generateMockListings,
  type MockNFTCollection,
  type MockNFTListing 
} from "./mock-data.js";

export interface MagicEdenListing {
  mint: string;
  collectionSymbol: string;
  sellerAddress: string;
  price: number;
  makerBoard: string;
  source: "Magic Eden" | "Tensor" | "Hyperspace" | "Mock (Devnet)";
}

export interface NFTFloorData {
  collectionSymbol: string;
  floorPrice: number;
  volume24h: number;
  volume7d: number;
  floorPrice24h: number;
  floorPrice7d: number;
  listedCount: number;
  totalItems: number;
  source?: "Magic Eden" | "Mock (Devnet)";
}

/**
 * Fetch floor price and volume data (supports mainnet and devnet)
 */
export async function fetchMagicEdenFloorData(collectionSymbol: string): Promise<NFTFloorData | null> {
  // Devnet: Use mock data
  if (isDevnet()) {
    const mockStats = getMockCollectionStats(collectionSymbol);
    if (!mockStats) {
      console.log(`[DEVNET] Mock collection not found: ${collectionSymbol}`);
      return null;
    }
    return {
      collectionSymbol,
      floorPrice: mockStats.floorPrice,
      volume24h: mockStats.volume24h,
      volume7d: mockStats.volume7d,
      floorPrice24h: mockStats.floorPrice24h,
      floorPrice7d: mockStats.floorPrice7d,
      listedCount: mockStats.listedCount,
      totalItems: mockStats.totalItems,
      source: "Mock (Devnet)",
    };
  }

  // Mainnet: Fetch from Magic Eden
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/stats`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch floor data for ${collectionSymbol}`);
      return null;
    }

    const data = await response.json();
    return {
      collectionSymbol,
      floorPrice: data.floorPrice || 0,
      volume24h: data.volume24h || 0,
      volume7d: data.volume7d || 0,
      floorPrice24h: data.floorPrice24h || data.floorPrice || 0,
      floorPrice7d: data.floorPrice7d || data.floorPrice || 0,
      listedCount: data.listedCount || 0,
      totalItems: data.totalItems || 0,
      source: "Magic Eden",
    };
  } catch (error) {
    console.error("Error fetching Magic Eden floor data:", error);
    return null;
  }
}

/**
 * Fetch trending collections (supports mainnet and devnet)
 */
export async function fetchTrendingCollections(limit: number = 10): Promise<any[]> {
  // Devnet: Use mock data
  if (isDevnet()) {
    return getMockTrendingCollections(limit);
  }

  // Mainnet: Fetch from Magic Eden
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections?sortBy=volumeAll&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trending collections: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching trending collections:", error);
    return [];
  }
}

/**
 * Fetch specific NFT listing from marketplace (supports mainnet and devnet)
 */
export async function fetchNFTListing(nftMint: string): Promise<MagicEdenListing | null> {
  // Devnet: Not implemented for now (mock data doesn't map mints directly)
  if (isDevnet()) {
    console.log(`[DEVNET] Direct NFT lookup not supported for devnet mocks`);
    return null;
  }

  // Mainnet: Fetch from Magic Eden
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/listings/${nftMint}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`NFT listing not found: ${nftMint}`);
      return null;
    }

    const listing = await response.json();
    return {
      mint: nftMint,
      collectionSymbol: listing.collectionSymbol || "",
      sellerAddress: listing.sellerAddress || "",
      price: listing.price || 0,
      makerBoard: listing.makerBoard || "",
      source: "Magic Eden",
    };
  } catch (error) {
    console.error("Error fetching NFT listing:", error);
    return null;
  }
}

/**
 * Calculate risk score based on market metrics
 * Lower score = safer investment
 */
export function calculateRiskScore(
  floorData: NFTFloorData,
  recentTrades: number = 10
): number {
  let riskScore = 3; // Base score

  // Liquidity analysis
  if (floorData.listedCount > 0 && floorData.totalItems > 0) {
    const liquidityRatio = floorData.listedCount / floorData.totalItems;
    if (liquidityRatio > 0.2) riskScore -= 2; // Good liquidity
    else if (liquidityRatio > 0.1) riskScore -= 1;
    else if (liquidityRatio < 0.01) riskScore += 2; // Poor liquidity
  }

  // Volume analysis
  const avgVolume7d = floorData.volume7d / 7;
  const avgVolume24h = floorData.volume24h;
  
  if (avgVolume24h > avgVolume7d * 1.5) riskScore -= 1; // Increasing volume is good
  else if (avgVolume24h < avgVolume7d * 0.5) riskScore += 1; // Decreasing volume is risky

  // Price volatility
  if (floorData.floorPrice7d > 0) {
    const volatility = Math.abs(
      (floorData.floorPrice - floorData.floorPrice7d) / floorData.floorPrice7d
    );
    
    if (volatility > 0.3) riskScore += 2; // High volatility
    else if (volatility > 0.1) riskScore += 1;
  }

  // Recent trades indicator (if available)
  if (recentTrades < 5) riskScore += 1; // Low trading activity

  return Math.min(5, Math.max(1, riskScore));
}

/**
 * Estimate potential return based on market conditions
 */
export function estimatePotentialReturn(
  riskScore: number,
  floorData: NFTFloorData,
  timeframe: "30d" | "90d" | "6m" = "90d"
): string {
  const volumeTrend = floorData.volume24h / (floorData.volume7d / 7);
  const baseReturn = riskScore === 1 ? 8 : riskScore === 2 ? 12 : riskScore === 3 ? 18 : 25;
  const volumeBonus = volumeTrend > 1.2 ? 10 : volumeTrend < 0.8 ? -5 : 0;
  const estimatedReturn = baseReturn + volumeBonus;

  const low = Math.round(estimatedReturn * 0.8);
  const high = Math.round(estimatedReturn * 1.2);

  return `${low}-${high}% in ${timeframe}`;
}

/**
 * Fetch NFT metadata from Arweave or IPFS
 */
export async function fetchNFTMetadata(uri: string): Promise<any> {
  try {
    if (!uri) return null;

    // Handle IPFS URLs
    if (uri.startsWith("ipfs://")) {
      const ipfsHash = uri.replace("ipfs://", "");
      return await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`).then(r => r.json());
    }

    // Handle HTTP(S) URLs
    if (uri.startsWith("http")) {
      const response = await fetch(uri);
      if (!response.ok) return null;
      return await response.json();
    }

    return null;
  } catch (error) {
    console.error("Error fetching NFT metadata:", error);
    return null;
  }
}

/**
 * Get market analysis for a collection
 */
export async function getCollectionAnalysis(collectionSymbol: string) {
  const floorData = await fetchMagicEdenFloorData(collectionSymbol);
  if (!floorData) return null;

  const riskScore = calculateRiskScore(floorData);
  const potentialReturn = estimatePotentialReturn(riskScore, floorData, "90d");

  return {
    collectionSymbol,
    floorData,
    riskScore,
    potentialReturn,
    analysis: {
      trend: floorData.volume24h > floorData.volume7d / 7 ? "bullish" : "bearish",
      liquidity: floorData.listedCount / (floorData.totalItems || 1) > 0.1 ? "good" : "poor",
      volatility:
        Math.abs((floorData.floorPrice - floorData.floorPrice7d) / floorData.floorPrice7d) > 0.2
          ? "high"
          : "moderate",
    },
  };
}

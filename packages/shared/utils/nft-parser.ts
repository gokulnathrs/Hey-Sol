/**
 * NFT Query Parser and Handler
 * Parses natural language queries and routes to appropriate NFT tools
 */

export interface NFTQuery {
  type: "trending" | "owned" | "buy" | "recommend" | "search"
  keywords: string[]
  timeframe?: "24h" | "7d" | "30d"
  riskLevel?: "low" | "medium" | "high"
  budget?: number
}

export const parseNFTQuery = (message: string): NFTQuery | null => {
  const lowerMsg = message.toLowerCase()

  // Trending NFTs queries
  if (
    lowerMsg.includes("trending") ||
    lowerMsg.includes("hot") ||
    lowerMsg.includes("popular") ||
    lowerMsg.includes("best performing") ||
    lowerMsg.includes("top")
  ) {
    const timeframeMatch = lowerMsg.match(/(24h|24 hours|1 day|7d|7 days|1 week|30d|30 days|1 month)/)
    return {
      type: "trending",
      timeframe: timeframeMatch ? getTimeframe(timeframeMatch[0]) : "24h",
      keywords: extractKeywords(message),
    }
  }

  // Owned NFTs / List NFTs queries
  if (
    lowerMsg.includes("my nfts") ||
    lowerMsg.includes("my collection") ||
    lowerMsg.includes("list nfts") ||
    lowerMsg.includes("owned nfts") ||
    lowerMsg.includes("show my nfts")
  ) {
    return {
      type: "owned",
      keywords: extractKeywords(message),
    }
  }

  // Buy / Purchase queries
  if (
    lowerMsg.includes("buy") ||
    lowerMsg.includes("purchase") ||
    lowerMsg.includes("invest") ||
    lowerMsg.includes("get me")
  ) {
    const budgetMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:sol|SOL)/)
    return {
      type: "buy",
      budget: budgetMatch ? parseFloat(budgetMatch[1]) : undefined,
      keywords: extractKeywords(message),
    }
  }

  // Recommendation queries
  if (
    lowerMsg.includes("recommend") ||
    lowerMsg.includes("suggest") ||
    lowerMsg.includes("best") ||
    lowerMsg.includes("good opportunity") ||
    lowerMsg.includes("what should i buy")
  ) {
    const riskMatch = lowerMsg.match(/(low|medium|high)\s*(?:risk)?/)
    const budgetMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:sol|SOL)/)

    return {
      type: "recommend",
      riskLevel: riskMatch ? (riskMatch[1] as "low" | "medium" | "high") : "medium",
      budget: budgetMatch ? parseFloat(budgetMatch[1]) : 50,
      keywords: extractKeywords(message),
    }
  }

  // Search / Explore queries
  if (
    lowerMsg.includes("search") ||
    lowerMsg.includes("find") ||
    lowerMsg.includes("explore") ||
    lowerMsg.includes("show me")
  ) {
    return {
      type: "search",
      keywords: extractKeywords(message),
    }
  }

  return null
}

const getTimeframe = (timeframeStr: string): "24h" | "7d" | "30d" => {
  const str = timeframeStr.toLowerCase()
  if (str.includes("7") || str.includes("week")) return "7d"
  if (str.includes("30") || str.includes("month")) return "30d"
  return "24h"
}

const extractKeywords = (message: string): string[] => {
  // Remove common words and extract meaningful keywords
  const commonWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "up", "about", "into", "through", "during",
    "i", "me", "my", "we", "our", "you", "your", "show", "list", "get",
    "me", "list", "nft", "nfts", "trending", "popular", "buy", "purchase",
    "recommend", "suggest", "find", "search", "explore", "sol", "solana"
  ])

  return message
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 2 && !commonWords.has(word))
    .slice(0, 5)
}

/**
 * Format NFT data for display in the AI response
 */
export const formatNFTResponse = (data: any, queryType: string): string => {
  switch (queryType) {
    case "trending":
      return formatTrendingResponse(data)
    case "owned":
      return formatOwnedResponse(data)
    case "recommend":
      return formatRecommendationResponse(data)
    default:
      return JSON.stringify(data)
  }
}

const formatTrendingResponse = (data: any): string => {
  if (!data.nfts || data.nfts.length === 0) {
    return "No trending NFTs found at the moment."
  }

  const formatted = data.nfts
    .slice(0, 5)
    .map(
      (nft: any) =>
        `• **${nft.collectionName}**\n  Floor: ${nft.floorPrice} SOL | Change: ${nft.change24h > 0 ? "+" : ""}${nft.change24h}% | Volume: ${nft.volume24h} SOL`
    )
    .join("\n")

  return `Here are the trending NFTs:\n\n${formatted}`
}

const formatOwnedResponse = (data: any): string => {
  if (!data.nfts || data.nfts.length === 0) {
    return "You don't own any NFTs yet. Would you like to explore trending collections?"
  }

  return `I found ${data.nfts.length} NFT${data.nfts.length !== 1 ? "s" : ""} in your wallet.`
}

const formatRecommendationResponse = (data: any): string => {
  if (!data.recommendations || data.recommendations.length === 0) {
    return "No recommendations found matching your criteria. Try adjusting your risk level or budget."
  }

  return "Based on your preferences, I've found some great opportunities:"
}

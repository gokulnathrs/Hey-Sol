"use client"

import React, { useState } from 'react'
import { TrendingUp, Zap, Target, ShoppingBag } from 'lucide-react'

export interface TrendingNFT {
  collectionName: string
  collectionMint: string
  floorPrice: number
  volume24h: number
  change24h: number
  image: string
  description: string
  itemCount: number
  listed: number
  metadata?: {
    trendScore: number
    buyingOpportunity: "Hot" | "Warm" | "Neutral"
  }
}

interface NFTListingPanelProps {
  nfts: TrendingNFT[]
  onSelectNFT: (nft: TrendingNFT) => void
  isLoading?: boolean
}

const NFTListingPanel: React.FC<NFTListingPanelProps> = ({
  nfts,
  onSelectNFT,
  isLoading = false
}) => {
  const getTrendColor = (change: number) => {
    if (change > 15) return 'text-green-500'
    if (change > 5) return 'text-emerald-400'
    return 'text-gray-400'
  }

  const getOpportunityBadgeColor = (opportunity: string) => {
    switch (opportunity) {
      case 'Hot':
        return 'bg-red-500/20 text-red-300 border border-red-500/30'
      case 'Warm':
        return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
      default:
        return 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-semibold text-white">Trending NFTs</h2>
          <span className="text-sm text-gray-400 ml-auto">{nfts.length} collections</span>
        </div>

        {isLoading ? (
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-slate-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {nfts.map((nft) => (
              <div
                key={nft.collectionMint}
                className="group cursor-pointer bg-slate-800/40 hover:bg-slate-700/40 border border-slate-700/50 hover:border-blue-500/30 rounded-lg p-4 transition-all duration-300"
                onClick={() => onSelectNFT(nft)}
              >
                <div className="flex gap-4">
                  {/* NFT Image */}
                  <div className="flex-shrink-0 w-24 h-24 bg-slate-700/50 rounded-lg overflow-hidden">
                    <img
                      src={nft.image}
                      alt={nft.collectionName}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/96?text=' + nft.collectionName
                      }}
                    />
                  </div>

                  {/* NFT Info */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors">
                            {nft.collectionName}
                          </h3>
                          <p className="text-sm text-gray-400 line-clamp-1">
                            {nft.description}
                          </p>
                        </div>
                        {nft.metadata && (
                          <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${getOpportunityBadgeColor(nft.metadata.buyingOpportunity)}`}>
                            {nft.metadata.buyingOpportunity}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <p className="text-gray-500">Floor</p>
                        <p className="font-semibold text-white">{nft.floorPrice.toFixed(2)} SOL</p>
                      </div>
                      <div>
                        <p className="text-gray-500">24h Vol</p>
                        <p className="font-semibold text-white">{(nft.volume24h).toFixed(0)} SOL</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Change</p>
                        <p className={`font-semibold ${getTrendColor(nft.change24h)}`}>
                          {nft.change24h > 0 ? '+' : ''}{nft.change24h.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Listed</p>
                        <p className="font-semibold text-white">{nft.listed}/{nft.itemCount}</p>
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center">
                    <button className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <ShoppingBag className="w-5 h-5 text-blue-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default NFTListingPanel

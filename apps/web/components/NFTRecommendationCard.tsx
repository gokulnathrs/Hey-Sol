"use client"

import React from 'react'
import { Lightbulb, Target, TrendingUp, AlertCircle } from 'lucide-react'

export interface NFTRecommendation {
  id: string
  nft: {
    collectionName: string
    collectionMint: string
    floorPrice: number
  }
  reason: string
  riskScore: number
  potentialReturn: string
  confidence: number
  note?: string
}

interface NFTRecommendationCardProps {
  recommendations: NFTRecommendation[]
  riskLevel: "low" | "medium" | "high"
  budget: number
  onSelectRecommendation: (rec: NFTRecommendation) => void
  isLoading?: boolean
}

const NFTRecommendationCard: React.FC<NFTRecommendationCardProps> = ({
  recommendations,
  riskLevel,
  budget,
  onSelectRecommendation,
  isLoading = false
}) => {
  const getRiskColor = (score: number) => {
    if (score <= 2) return 'bg-green-500/20 text-green-300 border-green-500/30'
    if (score <= 3) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    return 'bg-red-500/20 text-red-300 border-red-500/30'
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400'
    if (confidence >= 60) return 'text-yellow-400'
    return 'text-orange-400'
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <Lightbulb className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-semibold text-white">AI Recommendations</h2>
          <div className="ml-auto flex gap-2">
            <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
              Risk: {riskLevel}
            </span>
            <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded border border-purple-500/30">
              Budget: {budget} SOL
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 bg-slate-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2 opacity-50" />
            <p className="text-gray-400">No recommendations matching your criteria</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="group cursor-pointer bg-gradient-to-r from-slate-800/40 to-slate-700/30 hover:from-slate-700/50 hover:to-slate-600/40 border border-slate-700/50 hover:border-amber-500/30 rounded-lg p-4 transition-all duration-300"
                onClick={() => onSelectRecommendation(rec)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-white group-hover:text-amber-400 transition-colors">
                        {rec.nft.collectionName}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded border ${getRiskColor(rec.riskScore)}`}>
                        Risk {rec.riskScore}/5
                      </span>
                    </div>

                    <p className="text-sm text-gray-300">{rec.reason}</p>

                    {rec.note && (
                      <p className="text-xs text-orange-400 bg-orange-500/10 px-2 py-1 rounded inline-block">
                        ℹ️ {rec.note}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 space-y-3 text-right">
                    <div>
                      <p className="text-xs text-gray-500">Floor Price</p>
                      <p className="text-lg font-semibold text-white">{rec.nft.floorPrice.toFixed(2)} SOL</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Potential Return</p>
                      <p className="text-sm font-semibold text-green-400">{rec.potentialReturn}</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-500">Confidence</p>
                      <p className={`text-sm font-semibold ${getConfidenceColor(rec.confidence)}`}>
                        {rec.confidence}%
                      </p>
                    </div>
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

export default NFTRecommendationCard

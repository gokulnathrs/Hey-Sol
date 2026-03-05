"use client"

import React, { useState } from 'react'
import { Check, X, Loader } from 'lucide-react'

export interface NFTCheckout {
  nftMint: string
  collectionName: string
  floorPrice: number
  image: string
  sellerAddress: string
}

interface NFTCheckoutModalProps {
  nft: NFTCheckout | null
  onConfirm: (nft: NFTCheckout) => void
  onCancel: () => void
  isProcessing?: boolean
}

const NFTCheckoutModal: React.FC<NFTCheckoutModalProps> = ({
  nft,
  onConfirm,
  onCancel,
  isProcessing = false
}) => {
  const [accepted, setAccepted] = useState(false)

  if (!nft) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-md w-full space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Confirm Purchase</h2>
          {!isProcessing && (
            <button
              onClick={onCancel}
              className="p-1 hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}
        </div>

        {/* NFT Preview */}
        <div className="space-y-3">
          <div className="w-full h-48 bg-slate-800 rounded-lg overflow-hidden">
            <img
              src={nft.image}
              alt={nft.collectionName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/300?text=' + nft.collectionName
              }}
            />
          </div>

          <div>
            <p className="text-sm text-gray-400">Collection</p>
            <p className="font-semibold text-white">{nft.collectionName}</p>
          </div>
        </div>

        {/* Purchase Details */}
        <div className="space-y-3 py-4 border-t border-b border-slate-700">
          <div className="flex justify-between">
            <p className="text-gray-400">Price</p>
            <p className="font-semibold text-white">{nft.floorPrice.toFixed(2)} SOL</p>
          </div>

          <div className="flex justify-between">
            <p className="text-gray-400">Network Fee</p>
            <p className="font-semibold text-white">~0.00005 SOL</p>
          </div>

          <div className="flex justify-between text-lg">
            <p className="font-semibold text-white">Total</p>
            <p className="font-bold text-blue-400">{(nft.floorPrice + 0.00005).toFixed(5)} SOL</p>
          </div>
        </div>

        {/* Terms */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={isProcessing}
            className="mt-1 w-4 h-4 rounded border-gray-600 text-blue-500 cursor-pointer disabled:opacity-50"
          />
          <span className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
            I understand that I'm purchasing this NFT and the transaction is irreversible
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1 px-4 py-2 rounded border border-slate-600 hover:border-slate-500 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <button
            onClick={() => onConfirm(nft)}
            disabled={!accepted || isProcessing}
            className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Confirm Purchase
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Powered by HeySOL • Secure transaction
        </p>
      </div>
    </div>
  )
}

export default NFTCheckoutModal

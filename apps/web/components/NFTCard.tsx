import React from "react";

export type NFT = {
  mint: string;
  name: string;
  uri: string;
  image: string;
  description: string;
  attributes: { trait_type: string; value: string | number }[];
};

const NFTCard: React.FC<{ nft: NFT }> = ({ nft }) => (
  <div className="border border-foreground/50 rounded-lg p-4 bg-background/80 shadow-md mb-4 max-w-md">
    <img src={nft.image} alt={nft.name} className="w-full h-48 object-cover rounded" />
    <h3 className="text-lg font-bold mt-2">{nft.name}</h3>
    <p className="text-xs text-gray-500 mb-2">Mint: {nft.mint}</p>
    <p className="text-sm mb-2">{nft.description}</p>
    <div className="flex flex-wrap gap-2 mt-2">
      {nft.attributes.map((attr, idx) => (
        <span key={idx} className="px-2 py-1 bg-sol-purple/10 rounded text-xs text-sol-purple">
          {attr.trait_type}: {attr.value}
        </span>
      ))}
    </div>
    <a href={nft.uri} target="_blank" rel="noopener noreferrer" className="block mt-2 text-sol-green text-xs underline">
      View Metadata
    </a>
  </div>
);

export default NFTCard;
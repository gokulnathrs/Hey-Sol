import { z } from "zod";
import * as dotenv from "dotenv";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Address, appendTransactionMessageInstruction, compileTransactionMessage, createKeyPairSignerFromBytes, createSolanaRpc, createSolanaRpcSubscriptions, createTransactionMessage, generateKeyPairSigner, getSignatureFromTransaction, lamports, pipe, sendAndConfirmTransactionFactory, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners, TransactionSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { string } from "zod/v4";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import { fetchAssetsByOwner } from "@metaplex-foundation/mpl-core";
import { fetchMetadata, fetchMagicEdenListings } from "./helper/index.js";
import { isMainnet, isDevnet, logMode } from "./mode.js";
import {
  fetchMagicEdenListingData,
  createNFTPurchaseTransaction,
  verifyNFTListing,
  verifyPurchasePrerequisites,
} from "./nft-purchase.js";
import {
  createDevnetNFTPurchaseTransaction,
  verifyDevnetNFTListing,
  verifyDevnetPurchasePrerequisites,
} from "./devnet-purchase.js";

dotenv.config();

// Validate required environment variables
function validateEnvironment() {
  const requiredEnvVars = {
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY,
    RPC_URL: process.env.RPC_URL,
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`
    );
  }
}

async function send_sol(amount: string, address: string){
  try {
    const rpcUrl = process.env.RPC_URL;
    const rpcSubscriptions = createSolanaRpcSubscriptions(process.env.WS_RPC_URL as string);
    const rpc = createSolanaRpc(rpcUrl as string)

    const privateKey = bs58.decode(process.env.SOLANA_PRIVATE_KEY as string)
    
    const recepient = address as Address<string> ;
    const user = await createKeyPairSignerFromBytes(new Uint8Array(privateKey))

    const { value: latestBlockHash } = await rpc.getLatestBlockhash().send();

    const lamportAmount = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

    const transactionMessage = pipe(
      createTransactionMessage({ version: 0}),
      tx => setTransactionMessageFeePayer(user.address, tx),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockHash, tx),
      tx => appendTransactionMessageInstruction(
        getTransferSolInstruction({
          amount: lamports(BigInt(lamportAmount)),
          destination: recepient,
          source: user
        }),
        tx
      )
    )

    const signedTxn = await signTransactionMessageWithSigners(transactionMessage)
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

    try {
      await sendAndConfirmTransaction(
        signedTxn,
        {
          commitment: 'confirmed', skipPreflight: true
        }
      )

      const signature = getSignatureFromTransaction(signedTxn)
      console.log('✅ - Transfer transaction:', signature);
      return {
        status: "success",
        signature
      }
    } catch (e) {
        console.error('Transfer failed:', e);
        return {
          status: "failed",
          message: "Transfer failed"
        }
    }

  } catch (error) {
    console.error("Failed==> ",error)
    return {
          status: "failed",
          message: "Send_SOL Function failed"
        }
  }
}

async function main() {
  try {
    // Log current mode
    logMode("Hey-Sol MCP Server");

    // Validate environment before proceeding
    validateEnvironment();
    const RPC_URL = process.env.RPC_URL as string;

    const mcpServerOptions = {
      name: "hey-sol-mcp-server",
      version: "0.0.1",
    };

    const server = new McpServer(mcpServerOptions);

    server.tool(
      "prepare_send_sol_transaction",
      "Prepares an unsigned transaction to transfer SOL",
      {
        amount: z.string().describe("Amount of SOL to send"),
        address: z.string().describe("Recipient wallet address"),
        sender: z.string().describe("Sender wallet address"),
      },
      async ({ amount, address, sender }) => {
        try {
          const rpcUrl = process.env.RPC_URL as string;
          const rpc = createSolanaRpc(rpcUrl);

          // Get latest blockhash
          const { value: latestBlockHash } = await rpc.getLatestBlockhash().send();

          const lamportAmount = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

          // Build transaction message (unsigned)
          const compiledMessage = new TransactionMessage({
            payerKey: new PublicKey(sender),
            recentBlockhash: latestBlockHash.blockhash,
            instructions: [
              SystemProgram.transfer({
                fromPubkey: new PublicKey(sender),
                toPubkey: new PublicKey(address),
                lamports: lamportAmount,
              })
            ],
          }).compileToV0Message();

          const unsignedTx = new VersionedTransaction(compiledMessage);
          const serializedMessage = Buffer.from(unsignedTx.serialize()).toString("base64");
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: `Sending ${amount} SOL to ${address}, Sign the transaction to proceed.`,
                  type: "transaction",
                  action: "send-sol",
                  txMessageBase64: serializedMessage,
                  metadata: { recipient: address, amount }
                })
              }
            ]
          }
        } catch (error) {
          console.error("Failed to prepare transaction:", error);
          return {
            content: [
              {
                type: "text",
                text: "Error preparing unsigned transaction."
              }
            ]
          };
        }
      }
    );
    
    server.tool(
      "get_owned_nfts",
      "Fetch NFTs owned by a wallet (optionally filter by collection mint)",
      {
        owner: z.string().describe("Owner wallet public key"),
        collectionMint: z.string().optional().describe("Optional collection mint to filter NFTs"),
      },
      async ({ owner, collectionMint }) => {
        try {
          const umi = createUmi(RPC_URL);

          const assets = await fetchAssetsByOwner(umi, publicKey(owner));

          let filtered = assets;
          if (collectionMint) {
            filtered = assets.filter(
              (nft) =>
                nft.updateAuthority?.type === "Collection" &&
                nft.updateAuthority?.address === collectionMint
            );
          }

          const nftDetails: any[] = [];
          for (const nft of filtered) {
            const metadata = await fetchMetadata(nft.uri);
            nftDetails.push({
              mint: nft.publicKey.toString(),
              name: nft.name,
              uri: nft.uri,
              image: metadata?.image || null,
              description: metadata?.description || null,
              attributes: metadata?.attributes || [],
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "nft-list",
                  owner,
                  collectionMint: collectionMint || null,
                  nfts: nftDetails,
                }),
              },
            ],
          };
        } catch (err: any) {
          console.error("❌ get_owned_nfts error:", err);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching NFTs: ${err.message}`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get_trending_nfts",
      "Fetch trending NFTs based on trading volume and floor price changes (mainnet: Magic Eden, devnet: mock data)",
      {
        limit: z.number().min(1).max(50).default(10).describe("Number of trending NFTs to fetch"),
        timeframe: z.enum(["24h", "7d", "30d"]).default("24h").describe("Timeframe for trend analysis"),
      },
      async ({ limit, timeframe }) => {
        try {
          if (isDevnet()) {
            // Devnet: Use mock data
            const { getMockTrendingCollections } = await import("./mock-data.js");
            const mockCollections = getMockTrendingCollections(limit);
            
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    type: "trending-nfts",
                    mode: "devnet",
                    timeframe,
                    count: mockCollections.length,
                    source: "Mock NFT Collections (Devnet)",
                    nfts: mockCollections.map(c => ({
                      collectionName: c.name,
                      collectionMint: c.symbol,
                      floorPrice: c.floorPrice,
                      volume24h: c.volume24h,
                      change24h: ((c.floorPrice - c.floorPrice24h) / c.floorPrice24h) * 100,
                      image: c.image,
                      description: c.description,
                      itemCount: c.totalItems,
                      listed: c.listedCount,
                      verified: c.verified,
                    })),
                  }),
                },
              ],
            };
          }

          // Mainnet: Fetch from Magic Eden API - real trending data
          const magicEdenUrl = "https://api-mainnet.magiceden.dev/v2/collections?sortBy=volumeAll&limit=20";
          
          const response = await fetch(magicEdenUrl);
          if (!response.ok) {
            throw new Error(`Magic Eden API error: ${response.statusText}`);
          }

          const collections = await response.json();
          
          // Fetch floor price and volume data for each collection
          const trendingWithDetails = await Promise.all(
            collections.map(async (collection: any) => {
              try {
                const statsUrl = `https://api-mainnet.magiceden.dev/v2/collections/${collection.symbol}/stats`;
                const statsResponse = await fetch(statsUrl);
                const stats = await statsResponse.json();

                return {
                  collectionName: collection.name,
                  collectionMint: collection.symbol,
                  floorPrice: stats.floorPrice || 0,
                  volume24h: stats.volume24h || 0,
                  change24h: ((stats.floorPrice - (stats.floorPrice24h || stats.floorPrice)) / (stats.floorPrice24h || stats.floorPrice)) * 100,
                  image: collection.image || "",
                  description: collection.description || "",
                  itemCount: stats.totalItems || 0,
                  listed: stats.listedCount || 0,
                  verified: collection.verified || false,
                };
              } catch (e) {
                console.error(`Failed to fetch stats for ${collection.name}:`, e);
                return null;
              }
            })
          );

          const filtered = trendingWithDetails.filter(nft => nft !== null).slice(0, limit);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "trending-nfts",
                  mode: "mainnet",
                  timeframe,
                  count: filtered.length,
                  source: "Magic Eden",
                  nfts: filtered,
                }),
              },
            ],
          };
        } catch (err: any) {
          console.error("❌ get_trending_nfts error:", err);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching trending NFTs: ${err.message}`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get_nft_recommendations",
      "Get AI-powered NFT recommendations based on performance metrics and user preferences (mainnet: real data, devnet: mock data)",
      {
        riskLevel: z.enum(["low", "medium", "high"]).default("medium").describe("Investment risk tolerance"),
        budget: z.number().min(0.1).default(50).describe("Budget in SOL"),
        preferences: z.string().optional().describe("Preferences like 'gaming', 'art', 'utility', etc"),
      },
      async ({ riskLevel, budget, preferences }) => {
        try {
          let collections;

          if (isDevnet()) {
            // Devnet: Use mock data
            const { getMockTrendingCollections } = await import("./mock-data.js");
            collections = getMockTrendingCollections(15);
          } else {
            // Mainnet: Fetch real data from Magic Eden
            const magicEdenUrl = "https://api-mainnet.magiceden.dev/v2/collections?sortBy=volumeAll&limit=30";
            const response = await fetch(magicEdenUrl);
            
            if (!response.ok) {
              throw new Error("Failed to fetch collection data");
            }

            collections = await response.json();
          }

          // Filter and score collections based on risk level and budget
          const recommendations = collections.slice(0, 15).map((collection: any) => {
            const floorPrice = collection.floorPrice || 0;
            const volumeChange = isDevnet()
              ? (collection.volume24h - (collection.volume7d / 7)) / (collection.volume7d / 7)
              : ((collection.volume24h || 0) - (collection.volume7d || collection.volume24h || 0)) / (collection.volume7d || collection.volume24h || 1);
            const priceVolatility = Math.abs(
              ((floorPrice - (collection.floorPrice7d || floorPrice)) / (collection.floorPrice7d || floorPrice)) * 100
            );
            
            // Risk scoring: lower = safer
            let riskScore = 3;
            if (collection.listedCount && collection.totalItems) {
              const liquidityRatio = collection.listedCount / collection.totalItems;
              if (liquidityRatio > 0.1) riskScore = 2;
              if (liquidityRatio > 0.2) riskScore = 1;
            }
            if (priceVolatility > 20) riskScore += 2;
            if (volumeChange < 0) riskScore += 1;

            // Confidence based on volume
            const confidence = Math.min(95, 50 + (Math.min(collection.volume24h || 0, 100) * 0.5));

            // Potential return estimation
            const potentialReturn = riskScore <= 2 
              ? "8-15% in 90 days"
              : riskScore === 3
              ? "12-25% in 90 days"
              : "15-40% in 90 days";

            return {
              id: `rec-${collection.symbol || collection.collectionMint}`,
              nft: {
                collectionName: collection.name,
                collectionMint: collection.symbol || collection.collectionMint,
                floorPrice,
                image: collection.image || "",
                verified: collection.verified || false,
              },
              reason: `${collection.name} shows ${volumeChange > 0 ? "strong" : "moderate"} trading activity with ${collection.volume24h?.toFixed(2) || 0} SOL 24h volume`,
              riskScore: Math.min(5, Math.max(1, riskScore)),
              potentialReturn,
              confidence: Math.round(confidence),
            };
          });

          const validRecs = recommendations.filter((r: NFTRecommendation) => r !== null);
          
          // Filter by risk level and budget
          interface NFTRecommendation {
            id: string;
            nft: {
              collectionName: string;
              collectionMint: string;
              floorPrice: number;
              image: string;
              verified: boolean;
            };
            reason: string;
            riskScore: number;
            potentialReturn: string;
            confidence: number;
          }

          const filtered = validRecs.filter(
            (rec: NFTRecommendation) => rec.riskScore <= (riskLevel === "low" ? 2 : riskLevel === "medium" ? 3 : 5)
              && rec.nft.floorPrice <= budget
          );

          // Sort by confidence
          const sorted = filtered.sort((a: NFTRecommendation, b: NFTRecommendation) => b.confidence - a.confidence).slice(0, 5);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "nft-recommendations",
                  mode: isDevnet() ? "devnet" : "mainnet",
                  riskLevel,
                  budget,
                  preferences: preferences || "general",
                  source: isDevnet() ? "Mock NFT Collections (Devnet)" : "Magic Eden + Market Analysis",
                  recommendations: sorted.length > 0 ? sorted : validRecs.slice(0, 3).map((r: NFTRecommendation)=> ({
                    ...r,
                    note: r.nft.floorPrice > budget ? "Exceeds budget - consider waiting for floor price adjustment" : undefined
                  })),
                }),
              },
            ],
          };
        } catch (err: any) {
          console.error("❌ get_nft_recommendations error:", err);
          return {
            content: [
              {
                type: "text",
                text: `Error generating recommendations: ${err.message}`,
              },
            ],
          };
        }
      }
    );

    server.tool(
      "get_available_nft_listings",
      "Fetch available NFT listings from a collection for purchase (mainnet: Magic Eden, devnet: mock listings)",
      {
        collectionSymbol: z.string().describe("NFT collection symbol (e.g., 'degenapes' for devnet demo)"),
        limit: z.number().min(1).max(50).default(10).describe("Number of listings to fetch"),
        maxPrice: z.number().optional().describe("Optional max price filter in SOL"),
      },
      async ({ collectionSymbol, limit, maxPrice }) => {
        try {
          let listings: any[] = [];
          let floorData: any = null;

          if (isDevnet()) {
            // Devnet: Use mock data
            const { generateMockListings, getMockCollectionStats } = await import("./mock-data.js");
            listings = generateMockListings(collectionSymbol, limit);
            floorData = getMockCollectionStats(collectionSymbol);
          } else {
            // Mainnet: Fetch from Magic Eden
            listings = await fetchMagicEdenListings(collectionSymbol, limit);
            
            // Fetch floor data for context
            try {
              const floorUrl = `https://api-mainnet.magiceden.dev/v2/collections/${collectionSymbol}/stats`;
              const floorResponse = await fetch(floorUrl);
              if (floorResponse.ok) {
                floorData = await floorResponse.json();
              }
            } catch (e) {
              // Continue without floor data
            }
          }
          
          if (!listings || listings.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    type: "nft-listings",
                    mode: isDevnet() ? "devnet" : "mainnet",
                    collectionSymbol,
                    listings: [],
                    message: "No listings found for this collection"
                  })
                }
              ]
            };
          }

          // Filter by max price if provided
          let filtered = listings;
          if (maxPrice) {
            filtered = listings.filter((listing: any) => (listing.price || 0) <= maxPrice);
          }

          const enrichedListings = filtered.slice(0, limit).map((listing: any) => ({
            mint: listing.mint,
            price: listing.price || 0,
            sellerAddress: listing.sellerAddress || "",
            title: listing.title || `NFT #${listing.mint?.slice(0, 6)}`,
            image: listing.image || "",
            makerBoard: listing.makerBoard || "",
            available: true,
            attributes: listing.attributes || [],
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "nft-listings",
                  mode: isDevnet() ? "devnet" : "mainnet",
                  collectionSymbol,
                  source: isDevnet() ? "Mock Listings (Devnet)" : "Magic Eden",
                  floorPrice: floorData?.floorPrice || null,
                  listedCount: floorData?.listedCount || null,
                  listings: enrichedListings,
                  filtered: maxPrice ? `Price <= ${maxPrice} SOL` : "No price filter",
                })
              }
            ]
          };
        } catch (err: any) {
          console.error("❌ get_available_nft_listings error:", err);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Error fetching listings: ${err.message}`,
                  type: "error"
                })
              }
            ]
          };
        }
      }
    );

    server.tool(
      "prepare_purchase_nft_transaction",
      "Prepares a transaction to purchase an NFT (mainnet: Magic Eden, devnet: mock transaction)",
      {
        buyerAddress: z.string().describe("Buyer wallet public key"),
        collectionSymbol: z.string().describe("NFT collection symbol"),
        nftMint: z.string().describe("NFT mint address"),
        maxPrice: z.number().min(0.01).describe("Maximum price willing to pay in SOL"),
      },
      async ({ buyerAddress, collectionSymbol, nftMint, maxPrice }) => {
        try {
          const rpcUrl = process.env.RPC_URL as string;
          const connection = new Connection(rpcUrl);

          if (isDevnet()) {
            // Devnet: Use mock purchase flow
            const verification = await verifyDevnetNFTListing(collectionSymbol, nftMint, maxPrice);
            
            if (!verification.valid) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: verification.reason,
                      currentPrice: verification.currentPrice,
                      maxPrice,
                      type: "price-validation-failed"
                    })
                  }
                ]
              };
            }

            // Verify buyer balance
            const balanceCheck = await verifyDevnetPurchasePrerequisites(buyerAddress, verification.currentPrice, connection);
            if (!balanceCheck.canProceed) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: "Cannot proceed with purchase",
                      issues: balanceCheck.issues,
                      type: "prerequisites-failed"
                    })
                  }
                ]
              };
            }

            // Create mock purchase transaction
            const unsignedTx = await createDevnetNFTPurchaseTransaction(
              buyerAddress,
              collectionSymbol,
              nftMint,
              maxPrice,
              rpcUrl
            );

            if (!unsignedTx) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      error: "Failed to construct purchase transaction",
                      type: "transaction-construction-failed"
                    })
                  }
                ]
              };
            }

            const serializedMessage = Buffer.from(unsignedTx.serialize()).toString("base64");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: `Ready to purchase NFT for ${verification.currentPrice} SOL. Review and sign transaction to complete.`,
                    type: "transaction-ready",
                    action: "buy-nft-devnet",
                    mode: "devnet",
                    txData: {
                      txMessageBase64: serializedMessage,
                      unsignedTransaction: true,
                      requiresSignature: true,
                    },
                    purchaseDetails: {
                      nftMint,
                      collectionSymbol,
                      price: verification.currentPrice,
                      sellerAddress: verification.listing?.sellerAddress,
                      buyerAddress,
                      mockTransaction: true,
                    },
                    timestamp: new Date().toISOString(),
                  })
                }
              ]
            };
          }

          // Mainnet: Use Magic Eden purchase flow
          // Step 1: Fetch real listing data from Magic Eden API
          const listing = await fetchMagicEdenListingData(nftMint);
          
          if (!listing) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "NFT listing not found on Magic Eden marketplace",
                    nftMint,
                    type: "listing-not-found"
                  })
                }
              ]
            };
          }

          // Step 2: Verify listing is still valid and price is acceptable
          const priceVerification = await verifyNFTListing(nftMint, maxPrice);
          if (!priceVerification.valid) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: priceVerification.reason,
                    currentPrice: priceVerification.currentPrice,
                    maxPrice,
                    type: "price-validation-failed"
                  })
                }
              ]
            };
          }

          // Step 3: Verify buyer has sufficient balance and accounts exist
          const prerequisites = await verifyPurchasePrerequisites(
            buyerAddress,
            listing.seller,
            nftMint,
            maxPrice,
            connection
          );

          if (!prerequisites.canProceed) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "Cannot proceed with purchase",
                    issues: prerequisites.issues,
                    type: "prerequisites-failed"
                  })
                }
              ]
            };
          }

          // Step 4: Create the real purchase transaction
          const unsignedTx = await createNFTPurchaseTransaction(
            buyerAddress,
            nftMint,
            listing,
            rpcUrl
          );

          if (!unsignedTx) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "Failed to construct purchase transaction",
                    type: "transaction-construction-failed"
                  })
                }
              ]
            };
          }

          // Step 5: Serialize transaction for client signing
          const serializedMessage = Buffer.from(unsignedTx.serialize()).toString("base64");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  message: `Ready to purchase NFT from Magic Eden for ${listing.price} SOL. Review and sign transaction to complete.`,
                  type: "transaction-ready",
                  action: "buy-nft-magic-eden",
                  mode: "mainnet",
                  txData: {
                    txMessageBase64: serializedMessage,
                    unsignedTransaction: true,
                    requiresSignature: true,
                  },
                  purchaseDetails: {
                    nftMint,
                    collectionSymbol,
                    price: listing.price,
                    sellerAddress: listing.seller,
                    buyerAddress,
                    auctionHouseAddress: listing.auctionHouseAddress,
                    listingSignature: listing.signature,
                  },
                  magicEdenMarketplace: true,
                  timestamp: new Date().toISOString(),
                })
              }
            ]
          };
        } catch (error) {
          console.error("Failed to prepare NFT purchase:", error);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: `Error preparing purchase transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
                  type: "error"
                })
              }
            ]
          };
        }
      }
    );

    server.tool(
      "get_balance",
      "Returns the SOL balance of a wallet address",
      {
        address: z.string().describe("Wallet public key to check balance"),
      },
      async ({ address }) => {
        try {
          const rpcUrl = process.env.RPC_URL as string;
          const connection = new Connection(rpcUrl, "confirmed");
          const publicKey = new PublicKey(address);
          const balanceLamports = await connection.getBalance(publicKey, "confirmed");
          const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "balance",
                  address,
                  balance: balanceSol,
                  unit: "SOL",
                }),
              },
            ],
          };
        } catch (error: any) {
          console.error("❌ get_balance error:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching balance: ${error.message}`,
              },
            ],
          };
        }
      }
    );


    server.tool(
      "get_recent_transactions",
      "Fetch the recent N transactions for a given wallet",
      {
        wallet: z.string().describe("The wallet address to check"),
        limit: z.number().min(1).max(20).default(5).describe("Number of recent transactions to fetch")
      },
      async ({ wallet, limit }) => {
        try {
          const connection = new Connection(process.env.RPC_URL as string);

          // Fetch recent signatures
          const signatures = await connection.getSignaturesForAddress(
            new PublicKey(wallet),
            { limit }
          );

          console.log(`Fetched ${signatures.length} signatures for ${wallet}`);
          console.log(signatures)

          const txs: any[] = [];
          for (const sigInfo of signatures) {
            const tx = await connection.getTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0,
            });

            console.log('tx', tx)

            if (!tx) continue;

            let description = "Unknown transaction";

            // Simple decode example: check SOL transfer
            // tx.transaction.message.instructions.forEach((ix) => {
            // try {
            //   if ("parsed" in ix) {
            //     const parsed = (ix as any).parsed;
            //     if (parsed?.type === "transfer") {
            //       description = `${parsed.info.lamports / LAMPORTS_PER_SOL} SOL sent to ${parsed.info.destination}`;
            //     }
            //   }
            // } catch (e) {
            //   // ignore parse errors
            // }
            // });

            txs.push({
              signature: sigInfo.signature,
              slot: tx.slot,
              blockTime: tx.blockTime,
              description,
              status: sigInfo.confirmationStatus,
              sigInfo: sigInfo,
              tx: tx
            });
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  message: `Fetched ${txs.length} recent transactions`,
                  type: "transactions",
                  wallet,
                  transactions: txs,
                  signatures: signatures
                }, null, 2),
              },
            ],
          };
        } catch (err) {
          console.error("❌ Failed to fetch transactions:", err);
          return {
            content: [
              {
                type: "text",
                text: "Error fetching transactions",
              },
            ],
          };
        }
      }
    );


    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Starting MCP server with stdio transport");
  } catch (error) {
    console.error(
      "Failed to start MCP server:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
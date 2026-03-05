/**
 * Devnet NFT Purchase Handler
 * Creates mock purchase transactions for testing without real Auction House dependencies
 */
import { Connection, PublicKey, TransactionMessage, VersionedTransaction, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { generateMockListings } from "./mock-data.js";
/**
 * Create a mock NFT purchase transaction for devnet
 * Uses a simple SOL transfer from buyer to seller as a placeholder
 */
export async function createDevnetNFTPurchaseTransaction(buyerAddress, collectionSymbol, nftMint, maxPrice, rpcUrl) {
    try {
        const connection = new Connection(rpcUrl);
        // Get listings for the collection
        const listings = generateMockListings(collectionSymbol, 50);
        // Find the specific NFT in listings
        const nftListing = listings.find(l => l.mint === nftMint);
        if (!nftListing) {
            console.error(`[DEVNET] NFT not found in mock listings: ${nftMint}`);
            return null;
        }
        // Verify price
        if (nftListing.price > maxPrice) {
            console.error(`[DEVNET] Price ${nftListing.price} SOL exceeds max ${maxPrice} SOL`);
            return null;
        }
        // Get latest blockhash
        let latestBlockHash;
        try {
            const { value: bh } = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getLatestBlockhash",
                    params: [{ commitment: "confirmed" }],
                }),
            })
                .then(r => r.json())
                .then(data => ({ value: data.result.value }));
            latestBlockHash = bh.blockhash;
        }
        catch (e) {
            console.error("Failed to get blockhash:", e);
            return null;
        }
        const lamportAmount = Math.floor(nftListing.price * LAMPORTS_PER_SOL);
        const buyerPubkey = new PublicKey(buyerAddress);
        const sellerPubkey = new PublicKey(nftListing.sellerAddress);
        // Create a mock purchase transaction (simple SOL transfer)
        // In real scenario, this would be a proper SPL token transfer
        const compiledMessage = new TransactionMessage({
            payerKey: buyerPubkey,
            recentBlockhash: latestBlockHash,
            instructions: [
                SystemProgram.transfer({
                    fromPubkey: buyerPubkey,
                    toPubkey: sellerPubkey,
                    lamports: lamportAmount,
                }),
            ],
        }).compileToV0Message();
        const unsignedTx = new VersionedTransaction(compiledMessage);
        return unsignedTx;
    }
    catch (error) {
        console.error("Error creating devnet NFT purchase transaction:", error);
        return null;
    }
}
/**
 * Verify devnet NFT listing (from mock data)
 */
export async function verifyDevnetNFTListing(collectionSymbol, nftMint, maxPrice) {
    try {
        const listings = generateMockListings(collectionSymbol, 50);
        const listing = listings.find(l => l.mint === nftMint);
        if (!listing) {
            return {
                valid: false,
                currentPrice: 0,
                reason: "NFT listing not found in devnet mock data",
            };
        }
        if (listing.price > maxPrice) {
            return {
                valid: false,
                currentPrice: listing.price,
                reason: `Price ${listing.price} SOL exceeds max ${maxPrice} SOL`,
            };
        }
        return {
            valid: true,
            currentPrice: listing.price,
            listing,
        };
    }
    catch (error) {
        return {
            valid: false,
            currentPrice: 0,
            reason: `Error verifying listing: ${error}`,
        };
    }
}
/**
 * Verify buyer has sufficient balance for devnet purchase
 */
export async function verifyDevnetPurchasePrerequisites(buyerAddress, nftPrice, connection) {
    try {
        const buyerPubkey = new PublicKey(buyerAddress);
        const balanceLamports = await connection.getBalance(buyerPubkey, "confirmed");
        const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
        const issues = [];
        if (balanceSol < nftPrice) {
            issues.push(`Insufficient balance: ${balanceSol.toFixed(2)} SOL < ${nftPrice} SOL required`);
        }
        // Small buffer for transaction fees
        if (balanceSol < nftPrice + 0.01) {
            issues.push("Insufficient SOL for transaction fees (need at least 0.01 SOL extra)");
        }
        return {
            canProceed: issues.length === 0,
            issues: issues.length > 0 ? issues : undefined,
        };
    }
    catch (error) {
        return {
            canProceed: false,
            issues: [`Failed to verify prerequisites: ${error}`],
        };
    }
}

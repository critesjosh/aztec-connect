import { AssetValue } from '@aztec/barretenberg/asset';
import { toBigIntBE } from '@aztec/barretenberg/bigint_buffer';
import { DefiDepositProofData, ProofData } from '@aztec/barretenberg/client_proofs';
import { TxDao } from '../entity';
import { TxFeeResolver } from '../tx_fee_resolver';
import { RollupTimeout } from './publish_time_manager';

export interface RollupTx {
  excessGas: number;
  fee: AssetValue;
  tx: TxDao;
  bridgeId?: bigint;
}

export function createRollupTx(rawTx: TxDao, proof: ProofData): RollupTx {
  return {
    tx: rawTx,
    excessGas: rawTx.excessGas,
    fee: {
      assetId: proof.txFeeAssetId.readUInt32BE(28),
      value: toBigIntBE(proof.txFee),
    },
    bridgeId: undefined,
  };
}

export function createDefiRollupTx(rawTx: TxDao, proof: DefiDepositProofData): RollupTx {
  return {
    tx: rawTx,
    excessGas: rawTx.excessGas,
    fee: {
      assetId: proof.txFeeAssetId,
      value: proof.txFee,
    },
    bridgeId: proof.bridgeId.toBigInt(),
  };
}

export class BridgeTxQueue {
  // maintains an array of txs for this DefiBridge
  // we order by decreasing fee
  // this ensures that somebody paying the entire rollup cost (not just the bridge cost) will trigger a rollup
  private txQueue: RollupTx[] = [];

  constructor(
    private readonly bridgeId: bigint,
    private readonly feeResolver: TxFeeResolver,
    private readonly bridgeTimeout?: RollupTimeout,
  ) {}

  // add a new tx to the queue, order by decreasing fee
  public addDefiTx(newTx: RollupTx) {
    let index = this.txQueue.findIndex(tx => newTx.excessGas > tx.excessGas);
    if (index === -1) {
      index = this.txQueue.length;
    }
    this.txQueue.splice(index, 0, newTx);
  }

  // we need to traverse our queue of txs and attempt to complete a defi batch
  // completing a batch means producing a set of txs that make the batch profitable whilst still keeping within bridge size and rollup size
  public getTxsToRollup(maxRemainingTransactions: number, assetIds: Set<number>, maxAssets: number) {
    const txsToConsider: RollupTx[] = [];
    const newAssets = new Set<number>(assetIds);
    let gasFromTxs = 0;
    for (let i = 0; i < this.txQueue.length && txsToConsider.length < maxRemainingTransactions; i++) {
      const tx = this.txQueue[i];
      if (tx.fee.value && this.feeResolver.isFeePayingAsset(tx.fee.assetId)) {
        if (!newAssets.has(tx.fee.assetId) && newAssets.size === maxAssets) {
          continue;
        }
        newAssets.add(tx.fee.assetId);
      }
      txsToConsider.push(tx);
      gasFromTxs += this.feeResolver.getSingleBridgeTxGas(this.bridgeId) + tx.excessGas;
    }
    const fullBridgeGas = this.feeResolver.getFullBridgeGas(this.bridgeId);
    if (gasFromTxs >= fullBridgeGas) {
      this.txQueue.splice(0, txsToConsider.length);
      for (const asset of newAssets) {
        assetIds.add(asset);
      }
      return txsToConsider;
    }
    return [];
  }

  public transactionHasTimedOut(tx: RollupTx) {
    if (!this.bridgeTimeout?.timeout) {
      return false;
    }
    return tx.tx.created.getTime() < this.bridgeTimeout.timeout.getTime();
  }
}

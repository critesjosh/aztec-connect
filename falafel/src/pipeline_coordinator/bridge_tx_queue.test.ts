import { toBufferBE } from '@aztec/barretenberg/bigint_buffer';
import { TxType } from '@aztec/barretenberg/blockchain';
import { BridgeConfig } from '@aztec/barretenberg/rollup_provider';
import { numToUInt32BE } from '@aztec/barretenberg/serialize';
import { randomBytes } from 'crypto';
import { TxDao } from '../entity/tx';
import { TxFeeResolver } from '../tx_fee_resolver';
import { BridgeTxQueue, RollupTx } from './bridge_tx_queue';

const bridgeConfig: BridgeConfig = {
  bridgeId: 1n,
  numTxs: 5,
  gas: 500000,
  rollupFrequency: 2,
};

const BASE_GAS = 20000;
const NON_FEE_PAYING_ASSET = 999;

type Mockify<T> = {
  [P in keyof T]: jest.Mock;
};

const mockTx = (id: number, txType: TxType, txFeeAssetId: number, bridgeId: bigint) =>
  ({
    id,
    txType,
    proofData: Buffer.concat([
      numToUInt32BE(0, 32),
      randomBytes(32),
      randomBytes(32),
      randomBytes(7 * 32),
      numToUInt32BE(txFeeAssetId, 32),
      toBufferBE(bridgeId, 32),
      randomBytes(3 * 32),
      Buffer.alloc(32),
      numToUInt32BE(2, 32),
    ]),
  } as any as TxDao);

const createRollupTx = (
  id: number,
  txType: TxType,
  txFeeAssetId: number,
  bridgeId: bigint,
  excessGas: number,
  txFee = BigInt(1 + excessGas),
): RollupTx => {
  const tx = mockTx(id, txType, txFeeAssetId, bridgeId);
  return {
    tx,
    excessGas,
    fee: {
      assetId: txFeeAssetId,
      value: txFee,
    },
    bridgeId,
  };
};

const getFullBridgeGas = () => bridgeConfig.gas;
const getSingleBridgeTxGas = () => bridgeConfig.gas / bridgeConfig.numTxs;
const getAllOtherBridgeSlotsGas = () => getFullBridgeGas() - getSingleBridgeTxGas();

describe('Bridge Tx Queue', () => {
  let bridgeQ: BridgeTxQueue;
  let feeResolver: Mockify<TxFeeResolver>;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockImplementation(() => 1618226000000);

    feeResolver = {
      getMinTxFee: jest.fn().mockImplementation(() => {
        throw new Error('This should not be called');
      }),
      start: jest.fn(),
      stop: jest.fn(),
      getGasPaidForByFee: jest.fn().mockImplementation((assetId: number, fee: bigint) => fee),
      getBaseTxGas: jest.fn().mockReturnValue(BASE_GAS),
      getTxGas: jest.fn().mockImplementation(() => {
        throw new Error('This should not be called');
      }),
      getBridgeTxGas: jest.fn(),
      getFullBridgeGas: jest.fn().mockImplementation(getFullBridgeGas),
      getSingleBridgeTxGas: jest.fn().mockImplementation(getSingleBridgeTxGas),
      getTxFees: jest.fn(),
      getDefiFees: jest.fn(),
      isFeePayingAsset: jest.fn().mockImplementation((assetId: number) => assetId < 3),
    };

    bridgeQ = new BridgeTxQueue(bridgeConfig.bridgeId, feeResolver as any);
  });

  it("single tx that only covers it's own gas does not get returned", () => {
    const rollupTx = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(0);
  });

  it('single tx that covers the full bridge cost is returned', () => {
    const rollupTx = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, getAllOtherBridgeSlotsGas());
    bridgeQ.addDefiTx(rollupTx);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(1);
    expect(txsForRollup[0].tx.id).toEqual(1);
  });

  it('multiple txs that cover the bridge cost are returned', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(5);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('multiple txs are returned even with a single high fee tx', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, getAllOtherBridgeSlotsGas());
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(5);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([3, 1, 2, 4, 5]);
  });

  it('number of returned txs is limited to max slots', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, getAllOtherBridgeSlotsGas());
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 220000);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 320000);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const txsForRollup = bridgeQ.getTxsToRollup(3, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(3);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([3, 5, 4]);
  });

  it('multiple txs are not returned if not enough slots', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const txsForRollup = bridgeQ.getTxsToRollup(3, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(0);
  });

  it('multiple txs are not limited to bridge size', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx6 = createRollupTx(6, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx7 = createRollupTx(7, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx8 = createRollupTx(8, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    bridgeQ.addDefiTx(rollupTx6);
    bridgeQ.addDefiTx(rollupTx7);
    bridgeQ.addDefiTx(rollupTx8);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(8);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('multiple txs are not limited to single bridge size', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx6 = createRollupTx(6, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx7 = createRollupTx(7, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx8 = createRollupTx(8, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx9 = createRollupTx(9, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx10 = createRollupTx(10, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    bridgeQ.addDefiTx(rollupTx6);
    bridgeQ.addDefiTx(rollupTx7);
    bridgeQ.addDefiTx(rollupTx8);
    bridgeQ.addDefiTx(rollupTx9);
    bridgeQ.addDefiTx(rollupTx10);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(10);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('txs that cover full bridge cost are ordered by excess gas at front of queue', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 120000);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 130000);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 120000);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 130000);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 120000);
    const rollupTx6 = createRollupTx(6, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 140000);
    const rollupTx7 = createRollupTx(7, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 120000);
    const rollupTx8 = createRollupTx(8, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 120000);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    bridgeQ.addDefiTx(rollupTx6);
    bridgeQ.addDefiTx(rollupTx7);
    bridgeQ.addDefiTx(rollupTx8);
    const txsForRollup = bridgeQ.getTxsToRollup(10, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(8);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([6, 2, 4, 1, 3, 5, 7, 8]);
  });

  it('queue is depleted with each call', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx6 = createRollupTx(6, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx7 = createRollupTx(7, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx8 = createRollupTx(8, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx9 = createRollupTx(9, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx10 = createRollupTx(10, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    bridgeQ.addDefiTx(rollupTx6);
    bridgeQ.addDefiTx(rollupTx7);
    bridgeQ.addDefiTx(rollupTx8);
    bridgeQ.addDefiTx(rollupTx9);
    bridgeQ.addDefiTx(rollupTx10);
    let txsForRollup = bridgeQ.getTxsToRollup(5, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(5);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([1, 2, 3, 4, 5]);

    txsForRollup = bridgeQ.getTxsToRollup(8, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(5);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([6, 7, 8, 9, 10]);

    txsForRollup = bridgeQ.getTxsToRollup(8, new Set(), 10);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(0);
  });

  it('multiple txs are limited by number of assets', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, 1, bridgeConfig.bridgeId, 0);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 1, bridgeConfig.bridgeId, 1200000);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 2, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const assets = new Set<number>();
    const txsForRollup = bridgeQ.getTxsToRollup(10, assets, 1);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(2);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([3, 2]);
    expect(assets.size).toEqual(1);
    expect(assets.has(1)).toBeTruthy();
  });

  it('only fee-paying assets count towards the asset limit', () => {
    const rollupTx1 = createRollupTx(1, TxType.DEFI_DEPOSIT, 1, bridgeConfig.bridgeId, 0);
    const rollupTx2 = createRollupTx(2, TxType.DEFI_DEPOSIT, NON_FEE_PAYING_ASSET, bridgeConfig.bridgeId, 1200000);
    const rollupTx3 = createRollupTx(3, TxType.DEFI_DEPOSIT, 1, bridgeConfig.bridgeId, 1200000);
    const rollupTx4 = createRollupTx(4, TxType.DEFI_DEPOSIT, 0, bridgeConfig.bridgeId, 0);
    const rollupTx5 = createRollupTx(5, TxType.DEFI_DEPOSIT, 2, bridgeConfig.bridgeId, 0);
    bridgeQ.addDefiTx(rollupTx1);
    bridgeQ.addDefiTx(rollupTx2);
    bridgeQ.addDefiTx(rollupTx3);
    bridgeQ.addDefiTx(rollupTx4);
    bridgeQ.addDefiTx(rollupTx5);
    const assets = new Set<number>();
    const txsForRollup = bridgeQ.getTxsToRollup(10, assets, 1);
    expect(txsForRollup).toBeTruthy();
    expect(txsForRollup.length).toEqual(3);
    expect(txsForRollup.map(tx => tx.tx.id)).toEqual([2, 3, 1]);
    expect(assets.size).toEqual(1);
    expect(assets.has(1)).toBeTruthy();
  });
});

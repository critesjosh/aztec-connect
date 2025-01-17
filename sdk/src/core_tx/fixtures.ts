import { AliasHash } from '@aztec/barretenberg/account_id';
import { GrumpkinAddress } from '@aztec/barretenberg/address';
import { toBigIntBE } from '@aztec/barretenberg/bigint_buffer';
import { BridgeId } from '@aztec/barretenberg/bridge_id';
import { ProofId } from '@aztec/barretenberg/client_proofs';
import { TxId } from '@aztec/barretenberg/tx_id';
import { randomBytes } from 'crypto';
import { CoreAccountTx } from './core_account_tx';
import { CoreDefiTx } from './core_defi_tx';
import { CorePaymentTx } from './core_payment_tx';

export const randomCoreAccountTx = (tx: Partial<CoreAccountTx> = {}) =>
  new CoreAccountTx(
    tx.txId || TxId.random(),
    tx.userId || GrumpkinAddress.random(),
    tx.aliasHash || AliasHash.random(),
    tx.newSpendingPublicKey1 || randomBytes(32),
    tx.newSpendingPublicKey2 || randomBytes(32),
    tx.migrated || false,
    tx.txRefNo || 0,
    tx.created || new Date(),
    tx.settled,
  );

export const randomCorePaymentTx = (tx: Partial<CorePaymentTx> = {}) =>
  new CorePaymentTx(
    tx.txId || TxId.random(),
    tx.userId || GrumpkinAddress.random(),
    tx.proofId ?? ProofId.SEND,
    tx.assetId || 0,
    tx.publicValue || BigInt(0),
    tx.publicOwner || undefined,
    tx.privateInput || BigInt(0),
    tx.recipientPrivateOutput || BigInt(0),
    tx.senderPrivateOutput || BigInt(0),
    tx.isRecipient ?? true,
    tx.isSender ?? true,
    tx.accountRequired ?? true,
    tx.txRefNo || 0,
    tx.created || new Date(),
    tx.settled,
  );

export const randomCoreDefiTx = (tx: Partial<CoreDefiTx> = {}) =>
  new CoreDefiTx(
    tx.txId || TxId.random(),
    tx.userId || GrumpkinAddress.random(),
    tx.bridgeId || BridgeId.random(),
    tx.depositValue ?? toBigIntBE(randomBytes(4)),
    tx.txFee ?? toBigIntBE(randomBytes(4)),
    randomBytes(32),
    tx.txRefNo || 0,
    tx.created || new Date(),
    tx.settled,
    tx.interactionNonce,
    tx.isAsync,
    tx.success,
    tx.outputValueA,
    tx.outputValueB,
    tx.finalised,
    tx.claimSettled,
    tx.claimTxId,
  );

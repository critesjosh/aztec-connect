import { JoinSplitProofData } from '@aztec/barretenberg/client_proofs';
import { FieldResolver, Query, Resolver, Root } from 'type-graphql';
import { Inject } from 'typedi';
import { CachedRollupDb } from '../rollup_db';
import { JoinSplitTxType } from './join_split_tx_type';

@Resolver(() => JoinSplitTxType)
export class JoinSplitTxResolver {
  constructor(@Inject('rollupDb') private rollupDb: CachedRollupDb) {}

  @Query(() => [JoinSplitTxType!])
  async unsettledJoinSplitTxs() {
    const txs = await this.rollupDb.getUnsettledPaymentTxs();
    return txs.map(({ proofData, ...rest }) => {
      const joinSplitProofData = JoinSplitProofData.fromBuffer(proofData);
      return {
        ...rest,
        proofData,
        joinSplitProofData,
      };
    });
  }

  @FieldResolver()
  async inputOwner(@Root() { joinSplitProofData }: any) {
    return joinSplitProofData.publicOwner.toString();
  }

  @FieldResolver()
  async publicInput(@Root() { joinSplitProofData }: any) {
    return joinSplitProofData.publicValue;
  }

  @FieldResolver()
  async publicOutput(@Root() { joinSplitProofData }: any) {
    return joinSplitProofData.publicValue;
  }

  @FieldResolver()
  async assetId(@Root() { joinSplitProofData }: any) {
    return joinSplitProofData.publicAssetId;
  }

  @FieldResolver()
  async outputOwner(@Root() { joinSplitProofData }: any) {
    return joinSplitProofData.publicOwner.toString();
  }
}

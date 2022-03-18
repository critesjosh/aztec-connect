import { Blockchain } from '@aztec/barretenberg/blockchain';
import { BridgeConfig } from '@aztec/barretenberg/bridge_id';

export class BridgeResolver {
  constructor(
    private bridgeConfigs: BridgeConfig[],
    private blockchain: Blockchain,
    public defaultDeFiBatchSize: number,
  ) {}

  public getBridgeConfig(bridgeId: bigint) {
    return this.bridgeConfigs.find(bc => bc.bridgeId == bridgeId);
  }

  public getConfiguredBridgeIds() {
    return this.bridgeConfigs.map(bc => bc.bridgeId);
  }

  public getBridgeConfigs() {
    return this.bridgeConfigs;
  }

  public getFullBridgeGas(bridgeId: bigint) {
    return this.determineFullBridgeGas(bridgeId);
  }

  public setConf(defaultDeFiBatchSize: number) {
    this.defaultDeFiBatchSize = defaultDeFiBatchSize;
  }

  private determineFullBridgeGas(bridgeId: bigint) {
    const config = this.getBridgeConfig(bridgeId);
    if (config?.fee) {
      return config.fee;
    }
    const gasFromContract = this.blockchain.getBridgeGas(bridgeId);
    return gasFromContract;
  }

  public getMinBridgeTxGas(bridgeId: bigint) {
    const bridgeConfig = this.getBridgeConfig(bridgeId)!;
    const bridgeGas = this.getFullBridgeGas(bridgeId);
    const blockchainStatus = this.blockchain.getBlockchainStatus();
    if (blockchainStatus.allowThirdPartyContracts || bridgeConfig) {
      const numBridgeTxs = bridgeConfig ? BigInt(bridgeConfig.numTxs) : BigInt(this.defaultDeFiBatchSize);
      const requiredGas = bridgeGas / numBridgeTxs;
      return bridgeGas % numBridgeTxs > 0n ? requiredGas + 1n : requiredGas;
    } else {
      throw new Error('Cannot get gas. Unrecognised DeFi-bridge');
    }
  }
}
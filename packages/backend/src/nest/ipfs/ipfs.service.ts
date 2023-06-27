import { Inject, Injectable } from '@nestjs/common'
import { LazyModuleLoader } from '@nestjs/core'
import { create, IPFS } from 'ipfs-core'
import { IPFS_REPO_PATCH } from '../const'
import Logger from '../common/logger'

@Injectable()
export class IpfsService {
  public ipfsInstance: IPFS | null

  private readonly logger = Logger(IpfsService.name)
  constructor(
    @Inject(IPFS_REPO_PATCH) public readonly ipfsRepoPath: string,
    private readonly lazyModuleLoader: LazyModuleLoader
  ) {}

  public async create(peerId: any) {
    const { Libp2pModule } = await import('../libp2p/libp2p.module')
    const moduleRef = await this.lazyModuleLoader.load(() => Libp2pModule)
    const { Libp2pService } = await import('../libp2p/libp2p.service')
    const libp2pService = moduleRef.get(Libp2pService)
    const libp2pInstance = libp2pService?.libp2pInstance

    let ipfs: IPFS
    try {
      if (!libp2pInstance) {
        this.logger.log.error('no libp2p instance')
        throw new Error('no libp2p instance')
      }
      ipfs = await create({
        libp2p: async () => libp2pInstance,
        preload: { enabled: false },
        repo: this.ipfsRepoPath,
        EXPERIMENTAL: {
          ipnsPubsub: true,
        },
        init: {
          privateKey: peerId,
        },
      })
      this.ipfsInstance = ipfs
    } catch (error) {
      this.logger.log.error('ipfs creation failed', error)
    }

    return this.ipfsInstance
  }
}

# Native ETH mainnet deployment record

Status: **the corrected PredictionMarket, AssetRace and PriceArena are deployed
and configured. Tiny-value canaries and public frontend/service binding are
pending.**

Deployment date: 2026-09-25. Original release source: `455744a`; corrected
PredictionMarket source: `c53ba0a`. Chain ID: `4663`.
No VPS, keeper, frontend, nginx, GitHub Pages or `main` change was made as part
of this deployment.

## Deployed contracts and roles

| Component | Address |
|---|---|
| PredictionMarket | `0x4bfd0efc15C3198fe3AFf4741FF121AB2F38060e` |
| Superseded pre-canary PredictionMarket | `0xe6C4aAf95f43E35Ef309eEa61bAfb345226333EB` |
| AssetRace | `0x02F030Bd9D9DC86d713CDF0772ae4d1E3b81f235` |
| PriceArena | `0x383840a8Ca00dcB4b6cAc17e746c793426fE2f05` |
| Shared SignedPoolRaceOracle | `0x5b0f7e62E0A5fF5C5C02Ad219Afcd086F2618Db7` |
| Owner/deployer | `0x6d68157bEDa778346Dd27f8Ef4F917f69aD2Dc41` |
| Expected oracle signer | `0x79F4991Ccc64Cbb8143fB61e4cBD49b8b64d3635` |
| Keeper transaction account | `0xaF95287026339B51b1Ff45DC385b4D56F507634a` |

The shared oracle was reused, not redeployed. Its bytecode and
`TRUSTED_SIGNER()` were read-verified before deployment. Private keys and the
credential-bearing RPC URL were never recorded in repository files or agent
output.

`0xe6C4…33EB` is a historical pre-canary deployment, not an approved frontend or
keeper target. It received no game transactions. The corrected `0x4bfd…060e`
requires both funded sides and at least two distinct participant addresses.

## Receipt and cost summary

| Stage | Transactions | Blocks | Gas used | Paid |
|---|---:|---:|---:|---:|
| Superseded PredictionMarket deploy | 1 | `72244111` | 1,858,318 | `0.000066308502876 ETH` |
| Superseded PredictionMarket assets | 10 | `72250400–72250447` | 711,136 | `0.0000256209678 ETH` |
| AssetRace deploy | 1 | `72253652` | 4,612,064 | `0.000165028874048 ETH` |
| AssetRace assets/policy/presets | 27 | `72258649–72258780` | 3,299,544 | `0.000118255814054 ETH` |
| PriceArena deploy | 1 | `72262224` | 2,582,593 | `0.000092823557606 ETH` |
| PriceArena assets | 23 | `72264222–72264343` | 2,475,746 | `0.000090668997456 ETH` |
| Corrected PredictionMarket deploy | 1 | `72300695` | 1,937,192 | `0.00007001011888 ETH` |
| Redundant config sent to superseded address | 10 | `72303897–72303947` | 313,136 | `0.00001134217604 ETH` |
| Corrected PredictionMarket assets | 10 | `72304855–72304903` | 711,356 | `0.000025507224504 ETH` |
| **Total** | **84** | — | **18,501,085** | **`0.000665566233264 ETH`** |

All 84 receipts returned success. The redundant configuration rewrote the same
bindings on the unused superseded contract and affected no player state. Paid
values are the actual receipt totals, not pre-broadcast estimates.

## Verified postconditions

- Corrected PredictionMarket runtime hash:
  `0xf17f39d9b4e4411e04cbe0f567f78843257d3085808d8c174d60c8dcba74a971`.
  The deployment input hash
  `0x5fa2cc04442baa115e4d2f9d87af24e14aab6d963371b49a3dd90ed8a9b5ff39`
  exactly matches local commit `c53ba0a` creation bytecode plus the reviewed
  constructor args. Owner, shared oracle, fee `200`, seed cap `0.1 ETH` and
  per-wallet/side cap `0.1 ETH` match; `participantCount(0)` and `marketCount()`
  both returned zero before canary. All 10 corrected-contract Stock bindings
  independently passed receipt and registry readback `10/10`.
- AssetRace runtime hash:
  `0x0d6f480489f52a24e95fd2f20b2277e4070df2a8f7cd81caa4258f2b5c3ef65d`.
  All 23 bindings match exact category, oracle, oracle ID, decimals `18`, price
  age `60` and endpoint lag `0`. Community policy is exactly
  `300/300/180/300/0/200/2/100000000000000/100000000000000000`; duration
  presets `60/300/900` are enabled.
- PriceArena runtime hash:
  `0xfba5ab1762124133301d4398231b60e543206eb7244a251d603c3f73d616f47a`.
  Owner, min `0.0001 ETH`, max `0.1 ETH`, lobby `600` and fee `200` match. All
  23 bindings match exact oracle, oracle ID, decimals `18`, category and enabled
  flag. One batched public-RPC read of TENDIES timed out and passed immediately
  when retried alone; no onchain mismatch was present.

Independent post-broadcast reads were made through a public RPC rather than the
operator's secret endpoint. Registry totals were 10 Stocks and 13 Memes.

## Transaction hashes

### Corrected PredictionMarket release candidate

- Deploy: `0xb071cd13d11f1ac6796de02c5d18c30dfa35a2a108149b7afa83d67afd0114e2`
- NVDA: `0xa015c429dd2a3dd88caf9ac174c04dcf10b8e0994ce33f9d61b1904bd3bb21b6`
- TSLA: `0x4bf32e3a706b586d5d4f3df37b0f36981e0af350c69d4cbb93b984a07dab43d1`
- AAPL: `0xafdfcf054e7ef73fdd4f20a70c2b8af35a8f7ed3fc9116b8d6f16f29c038b37b`
- META: `0xde9e830c81b85fbb8c76fc4f96ad095201757b6936e50a0d83d3d9df3b05ce76`
- MSTR: `0xe626d0c071f65f8112dd2d6a98257de60c9e872470ed4efb28139e4a87bf26ed`
- AMZN: `0xab21bec0345ded98020182d2378abdb2c5508fe1d41bc3046d867e5a37af089b`
- MSFT: `0x16b1384d14056b29ca83ba11c70e9b60d0f5bc08f641d12d501c513e97932f19`
- GOOGL: `0x0ea5f277b17ec5e27b74581cb7c59590788b2ea6a89bbbdd363b6b1cd9b3bf04`
- MU: `0xf62893d64d94f251c48441119dc2648ea0813a773fadd29039ef6c6d2cc8fccd`
- NFLX: `0xebab106dafff9eb5c3a7f6757d791ee8edf61a5f77875e3f9b8726f673ba2879`

### Superseded PredictionMarket

- Deploy: `0xb344e66eaf5dbd5718671abaea210164608455a3b4bbfb8f3de9f3a23e987062`
- NVDA: `0x780efd6aaa7428cccf5d8438b13af638874b00efa6ee3fd479f90381fa7d851f`
- TSLA: `0x67cdba7ab92209d9b571c3eb04b59dcf35049aefcdd7978d742937a9471b22d0`
- AAPL: `0xdb7ee4ca620c76cf1d7a3b9e1527bdbd863c3a7f405828ac2458ba2ca832fd12`
- META: `0x697a7a8229ae7b9cd40d1b64cdca57348946b88939b033623e81d2359350a67c`
- MSTR: `0x74dce1d5a8fc086397903940001c1f919da5c09ab5b527382377bc887448b068`
- AMZN: `0x6eb629084604e274cb3cc3b9f696b030eefc5e1652424b2f44b784ccbcf76138`
- MSFT: `0x0c62843a8b84c66c32a0fb2d3773546ac6ed2b2549fb959d9ebba31c253bacdd`
- GOOGL: `0x1495a3c88aad88832b846a663d197c689e17af0b7cd040ce0220fb09d7b569cf`
- MU: `0x2e27cb074e815154248f21b1a4dc097ffa746eabe9b872789da995ffdd805423`
- NFLX: `0x224ed36aab42dbf29f2e1ca07d79c6bfd546970d8f7d99eab2020ddfbea5d77c`

The ten redundant configuration transactions to the superseded address were:
`0x2bdcd558727e2398e5c14cebcd28e6aa43f11de731cdc42a859bb6f3d282e75b`,
`0x9c467d5421646c59eab2611d08599f69d687bf4c578c981cb489ffba967b9a90`,
`0x11e464f13fe2b113f4b1e99b755cf27a52d65daaac7d8e88f5c2a9a29f8a7378`,
`0x948beac9fc041dfb6b1def464b95b5b146905b5faf1c9f336b34b6db3b27b22d`,
`0x2d3353079f5d2b0e66ab8230256d88d89f5fa3f93ecc4094dd968d48ad7139d1`,
`0x43d4d3bf6ed3074400c98da3d0a1d48bd602c779af094a1d45deb72595e8f589`,
`0x4f29bbacb7fecb7f8956bfc89147d9e37f422e2e4d4f273b503c53e79f4f474b`,
`0x3d684e569d144558776e0da26160ae86ee810fe0285d38d7cda59ed7fe295d9d`,
`0x73d79bdf4d3c131a7fff17a81912f58e454a805d058e6dc3ad272e280a229191`
and `0x604c1d20b92550bcb886fc1087c39283f3a2e33a9aadb25bf9711f0100ec76ce`.

### AssetRace

- Deploy: `0x719f18adf13ce79a14fa1d87d9c48ebecbe4ac5dc9a67810833f903edc5ba1b0`
- NVDA: `0xc2f317f7607d833c73e4b8ac2b9844f7f3e63d68dca4a996d65d7bfcbfbb4def`
- TSLA: `0x73616836f8740ef49bbf00276f6eeb9ae199f75c986146e81bb3b5ebc17be4cd`
- AAPL: `0x8c2f1e077fa9be2c707e7d0e73ffb1fbfd65deb5844b83e240038ecf45c5bf3c`
- META: `0xef4e297ca772bbd47fb8251c86965e585e9919b110a707f4e393b0aac32af3c2`
- MSTR: `0x9979729d9ca191fb824d0173acaf93c0a2fadffcc7284f9e3fbae127aea26dc6`
- AMZN: `0x2b071b601b4137f4853342b1bad46b6f939d3e56595cff717cd73041bf6497d7`
- MSFT: `0x660876d27104e7c965f5c1ed421f85fa094a7c3d9e80d4f975ca198e043f627f`
- GOOGL: `0x760a4cc1bc5b761dee86d0a70a77228e2ce1647c1bc51516a4800ee9879c2e73`
- MU: `0x7ac38cc2332ab5faa104332079c3d48d48c60666c48d41460e10a0951eb1584e`
- NFLX: `0xbb3ae768e8418e614081ba4ba6af5c0313440428156213094a9285e9fab54fcd`
- AI: `0x0a8f44a3bb3961f237c3122d9f1fae29a4d2029c06a701486b4d8ffc3f9ea6c2`
- CASHCAT: `0xa5ff639339f0934cf70777274b3c5b0a0480bcbaaf91d38ec805eec751da9b7c`
- HOOD: `0xb02e41927a73a9fe4bbd2b834985d0c9483898abb66bd54f2b639dd4f89f7c58`
- BLORB: `0x3421601eebbbd76d8be5c0ae7f746489f7daf5b48fd8e669a75c2f25b3f107b3`
- CHUMP: `0xdf1c65279fdb74643596ee91c58f6e28c8de6246e3449c920776d3a119ddcc30`
- BONER: `0x08b72a302380b43529b36fc3219fc1a9ae24f192ba355151b579979c98009770`
- PIPEDOG: `0xbf81ddb98405f713d1192ab769bcae453d1d26d9a81ac94a0998fb5707f21057`
- TENDIES: `0xc93e76ee6f1627c9e458694757c4d9f6d8fed7d3662346016e39d9c13f66d8d5`
- IF: `0x1add68c0ad1403fda4d2a0ac7d5f7db08589abdf2ffb7c2c55292f63d1395f3d`
- JUGGERNAUT: `0xe334caca666aa78cfd3e3ad1833ab34633714bbf203cf44005bbbe91090d62bf`
- MOO: `0x881472b368bb5faccb156aa8b0276069c094090de1927a81bf2ebdbd0412d40d`
- FRONG: `0x72175e622ed3c4a7b3d48f1621d4a204a94a849b2a505c2466294f711c5a6438`
- DOGO: `0xe65cbf3ef36c978d4dac3f3a035bfa2bc512429f7bf3afd5965375c2d5e113aa`
- Community policy: `0x3a013a1edcd5b1ae7f2ce4abd9aecd08b36e51d5398be172449ea03bee69dbba`
- Duration 60: `0x2a3d4d017d020adcdd96d7917bc61de26c143d917e4aa34f12d7743eb7fcf90b`
- Duration 300: `0x7af506b721be78ab1ddee7c7204f79fff5cb2a164a72ae40a469588335c6da25`
- Duration 900: `0xcfa8578c952dac9ce66146b8bc677d5d23e24e2d2bb16744e7dcdc1f557e33ed`

### PriceArena

- Deploy: `0xb5a0a3530e8f5d65213e8b7553e3af272e76b63b75ae2659b05a02346f6aaa94`
- NVDA: `0x03ae1a56b31834ded3ae7699e09c7edae040b42156bf1a5ed04990416e939f2e`
- TSLA: `0x9452ad6d52bd3d2a466b2947006dbd43d6ddcf04f30e4a217b264937180bae53`
- AAPL: `0x817e19e6b215e92565253f5a3a21915f9129e32e72e02daf54feaf211476b11f`
- META: `0x9de64413de66b051fc24ace37b8e475394a698c13f37d574508b2bbe1b3221ed`
- MSTR: `0x2581ce13a4cbd123ff0c3d3fc48c601e2069b56fadaa49728a10671f2369dfac`
- AMZN: `0xf4a5d23aef96e32b26601fbca0589efa01edd84308f9116c7f39d3f95f45b15e`
- MSFT: `0xc20c96eb198a64f10564527fc21403919498a30ba5703766abb3471f19d258e1`
- GOOGL: `0xad7c6d0895b9a9698a1115ebf7540147d13969611b804bb4056c7e13335c167a`
- MU: `0xc6acb3bc185ef698670537dc065e59b3294931fc1ff8db708501a8e66eb4b9ef`
- NFLX: `0xed7918bb1ff97fb816e0a7185bb191800ab93c0978e029040c6caf8267591e56`
- AI: `0x46c20c2785a2176131b0396324552d62ce03f5064859e94f0fbc5182318bb4bd`
- CASHCAT: `0x5038246a6de717a205eee912d2beb12d053e0954aa8370cdc32d9705fd03adea`
- HOOD: `0x73fbdf0e6cc1ec0013ce5b38137360238380d421bcbab467e92e2e03d56064bc`
- BLORB: `0x1aac463a87def40c00d88cf851b8954b9961fa641155329863ba01f0d1857b60`
- CHUMP: `0x473cfbb2af4e3761165a8710bd8cd2e1c722cc7c608b80519b92ed2eac40bfaf`
- BONER: `0x260d7d9495ce32904e48ec39bf66c34c039ec48e4e6fde4e7d855d6b37fc03ab`
- PIPEDOG: `0x96e2f7d2709138802e7d7d1eb5d16bfabd277159651d3c5d00c629138929cd2f`
- TENDIES: `0xc0100762867ee14b796965a65b5812c8185c9c933211f39fe2c85d7a8c53384e`
- IF: `0xc3fcc7c08a867e466011a3631c76ac44de33fe6f8fd58d54b6684f959773e16b`
- JUGGERNAUT: `0xed52b4d3563a0035c7395b4dc0fa0064abde7948f286912831927846c1576042`
- MOO: `0x2d06cc992621c40f76f75f9932437602e3129b61ff8ddbd4dcdab982b9932a03`
- FRONG: `0x60e48372f03d64f9ae1b5c136f55d6827496db2be7132c7b1dab2e5dc193b11a`
- DOGO: `0xd139438135cb8cb55166f9eff4c7911f9f57af9155235619e9c3fb017c6911ef`

## Remaining gates

The deployed contracts are not yet approved for public traffic. Before binding
frontend or services:

1. run separately approved tiny-value lifecycles for all three products;
2. verify entry, keeper transition, resolution/cancellation and claim/refund;
3. prepare and validate a production binding diff with the exact addresses;
4. rebind existing keepers without running parallel USDG workers;
5. merge to `main` and deploy from the canonical VPS checkout only after another
   explicit approval.

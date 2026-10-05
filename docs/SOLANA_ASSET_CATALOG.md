# Каталог активов на Solana

Собрано скриптами `scripts/solana-catalog-scan.mjs` → `scripts/solana-catalog-propose.mjs` по живым данным Jupiter и DexScreener (2026-10-05T11:16:12.905Z).
Адреса токенов — только «verified» в Jupiter.

**Утверждено владельцем 2026-10-05** (`config/solana-catalog-approved.json`): 30 активов. В программы и интерфейс mainnet попадают только они.

## Правила отбора

- Пул к USDC в приоритете (цена в долларах напрямую). Если пул к USDC тонкий, берём самый глубокий пул к SOL — цена переводится в доллары через SOL/USDC в том же слоте.
- Минимальная ликвидность выбранного пула: крипта $500k, мемы $500k, акции $250k. Чем тоньше пул, тем дешевле сдвинуть цену в момент старта/финиша.
- Только типы пулов, которые умеет читать сервис цен: Raydium AMM v4 / CPMM / CLMM, Orca Whirlpool, Meteora DLMM, PumpSwap.
- Ликвидность и объём — снимок на момент скана; перед mainnet скан повторяется.

## Крипта — предлагается (7)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| SOL | [`Czfq3x…44zE`](https://dexscreener.com/solana/czfq3xzzdmsdgduyrnltrhgc47cxcztlg4crryfu44ze) | orca wp | USDC | $30.6M | $89.3M | `So11111111111111111111111111111111111111112` |
| cbBTC | [`HxA6SK…syLM`](https://dexscreener.com/solana/hxa6skw5qa4o12fjvgtpxdq2ynz5zv1s7sb4ffomsylm) | orca wp | USDC | $6.0M | $12.0M | `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij` |
| ETH | [`HktfL7…CcEF`](https://dexscreener.com/solana/hktfl7iwgkt5qhjywqkcdnzxscoh811k7akrmzjkccef) | orca wp | SOL | $7.0M | $4.2M | `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs` |
| HYPE | [`ANCx14…3qLB`](https://dexscreener.com/solana/ancx141sujgvdbkz9nteh8f38qwsnyyxsvju64au3qlb) | meteora DLMM | USDC | $3.0M | $506k | `98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g` |
| wNEAR | [`gyYigq…238U`](https://dexscreener.com/solana/gyyigqg8vdemkdnttvl6at2msbhdtdwyb6bccyr238u) | raydium CPMM | USDC | $2.7M | $433k | `3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG` |
| ZEC | [`GTHKH8…jiPm`](https://dexscreener.com/solana/gthkh8s82zr8gtsfz1duu6wfdxhy59wpmshxzg5zjipm) | orca wp | USDC | $3.2M | $6.3M | `A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS` |
| PUMP | [`2uF4Xh…oiSd`](https://dexscreener.com/solana/2uf4xh61rdwxng9woyxsvqp7zua6klfpb3nvnrqeoisd) | pumpswap standard | USDC | $28.1M | $6.1M | `pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn` |

## Мемы — предлагается (10)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| TRUMP | [`3C5YE9…DbW9`](https://dexscreener.com/solana/3c5ye97hadpdxzehyq9cis8axr9anyrusczkze1ndbw9) | meteora DLMM | USDC | $11.8M | $2.0M | `6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN` |
| PENGU | [`DdMA1c…dvzU`](https://dexscreener.com/solana/ddma1chcheqyfttc1z1sjey978ccu1pyjnutwtnmdvzu) | meteora DLMM | USDC | $4.5M | $3.4M | `2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv` |
| $WIF | [`EP2ib6…eyMx`](https://dexscreener.com/solana/ep2ib6dydeeqd8mfe2ezhcxx3kp3k2elkkirfpm5eymx) | raydium standard | SOL | $7.0M | $586k | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| FARTCOIN | [`Bzc9NZ…5iiw`](https://dexscreener.com/solana/bzc9nzfmqkxr6fz1dbph7bdf9broyef6pnzesp7v5iiw) | raydium standard | SOL | $9.1M | $777k | `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` |
| PONKE | [`5uTwG3…Q6zE`](https://dexscreener.com/solana/5utwg3y3f5cx4ykodgtjwehdrx5hdkz5bzz72x8eq6ze) | raydium standard | SOL | $1.7M | $30k | `5z3EqYQo9HiCEs3R84RCDMu2n7anpDMxRhdK8PSWmrRC` |
| PNUT | [`4AZRPN…AY9i`](https://dexscreener.com/solana/4azrpnefcj7iw28rju5auyeqhycvdcnm8cswyl51ay9i) | raydium standard | SOL | $3.7M | $127k | `2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump` |
| PIPPIN | [`8WwcNq…bvdt`](https://dexscreener.com/solana/8wwcnqdzjcy5pt7akhupafknv2txca9sq6ybkgzlbvdt) | raydium standard | SOL | $4.3M | $178k | `Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump` |
| BOME | [`DSUvc5…srmt`](https://dexscreener.com/solana/dsuvc5qf5ljhhv5e2td184ixotsncnwj7i4jja4xsrmt) | raydium standard | SOL | $18.3M | $1.2M | `ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82` |
| POPCAT | [`HBS7a3…Z3kS`](https://dexscreener.com/solana/hbs7a3br8gmmwuqva7vb3smfa7xvi1tsfdof5w4zz3ks) | raydium standard | USDC | $649k | $44k | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` |
| MEW | [`879F69…ebce`](https://dexscreener.com/solana/879f697iudjgmevrkrcnw21fcxiaeljk1ffsw2atebce) | raydium standard | SOL | $10.7M | $402k | `MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5` |

## Акции (xStocks) — предлагается (13)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| NVDAx | [`49iMat…yyw6`](https://dexscreener.com/solana/49imatqtoyabsyaqc8gafvq6aebfvdxsrh44oiatyyw6) | raydium CLMM | USDC | $2.9M | $671k | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` |
| TSLAx | [`8aDaBQ…NpFF`](https://dexscreener.com/solana/8adabqktrs6hvmjyc6ezebgdiaxhlygridwkwwp1npff) | raydium CLMM | USDC | $2.3M | $328k | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| AAPLx | [`CKwJZw…uF8y`](https://dexscreener.com/solana/ckwjzwm7oj3nu4653n1epdrqxbxayxopfipeenlouf8y) | raydium CLMM | USDC | $298k | $18k | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| METAx | [`3L7KbP…t63j`](https://dexscreener.com/solana/3l7kbpvaaqa4utecagqysm6ucq5f3szm9zaykxqyt63j) | raydium CLMM | USDC | $760k | $105k | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` |
| MSTRx | [`RyhF4c…pbGv`](https://dexscreener.com/solana/ryhf4cksvzy7vcqjpoythcxcgnkrp27peghsneppbgv) | raydium CLMM | USDC | $710k | $255k | `XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ` |
| AMZNx | [`6m5aXA…rUiD`](https://dexscreener.com/solana/6m5axave4uh6kt4ytkyclwnmjd8pyp5vujwnctycruid) | raydium CLMM | USDC | $405k | $34k | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` |
| MSFTx | [`CLu4kF…XjsL`](https://dexscreener.com/solana/clu4kfm4nb67xrdn7vjnmxxxir8z5ha4hjuzpfccxjsl) | raydium CLMM | USDC | $721k | $186k | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` |
| GOOGLx | [`B8YAwj…obRw`](https://dexscreener.com/solana/b8yawjgyk6qidwzgbxmaxp7nyfg8g74ez3y4gfssobrw) | raydium CLMM | USDC | $839k | $150k | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` |
| COINx | [`w7SGmP…iqxa`](https://dexscreener.com/solana/w7sgmpexomcsjvxqgsamun56uypydsjatsxevkaiqxa) | raydium CLMM | USDC | $1.5M | $72k | `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu` |
| HOODx | [`DXWbip…7LXs`](https://dexscreener.com/solana/dxwbip5lducmabdssplyz9xik3253epeayqufqtx7lxs) | raydium CLMM | USDC | $1.5M | $19k | `XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg` |
| CRCLx | [`GYqHju…yaFV`](https://dexscreener.com/solana/gyqhjudztiw7i52xv1qohde6ejr6eszpsrbvikgzyafv) | raydium CLMM | USDC | $3.3M | $1.0M | `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1` |
| SPYx | [`6truu3…nDDE`](https://dexscreener.com/solana/6truu3rzuib9rkqg4vyc3dt3qwv7dgwgqxryucrvndde) | raydium CLMM | USDC | $2.7M | $195k | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| QQQx | [`GMjGLW…U1aG`](https://dexscreener.com/solana/gmjglwzvk75lpetrgamdexnvxc4fuuqpwjxeqqtdu1ag) | raydium CLMM | USDC | $2.2M | $104k | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` |

## Отклонены владельцем

| Актив | Причина |
|---|---|
| BONK | best decodable pool $412k, below the $500k meme floor |
| AI16Z | best pool $49k; price can be moved cheaply at a boundary |
| SLERF | no supported USDC/SOL pool |
| XRP | wXRP best pool $40k, below the $500k floor |
| ADA | best pool $83k |
| SUI | best pool $102k |
| BNB | best pool $164k |
| DOGE | best USDC pool $341k, below the $500k floor |

## Не прошли автоматический отбор

| Категория | Актив | Причина |
|---|---|---|
| crypto | wXRP | liquidity $40k < $500k |
| crypto | ADA | liquidity $83k < $500k |
| crypto | SUI | liquidity $102k < $500k |
| crypto | BNB | liquidity $164k < $500k |
| crypto | DOGE | liquidity $341k < $500k |

## Что учесть при утверждении

- **SOL** — актив в гонках и аренах (цена из SOL/USDC), хотя ставки тоже в SOL.
- **Акции xStocks** торгуются 24/7, но базовая биржа работает по расписанию. Вне торговых часов цена пула почти стоит или дрейфует — гонки акций лучше запускать в часы торгов NYSE/Nasdaq.
- **xStocks: freeze authority у эмитента не отключена** (регулируемый токен). Нам это не мешает — мы только читаем цену пула и не держим сами токены.
- Полные адреса пулов и параметры — в `docs/solana-catalog/proposed.json`.

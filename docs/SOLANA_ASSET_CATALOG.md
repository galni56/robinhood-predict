# Каталог активов на Solana — на утверждение

Собрано скриптами `scripts/solana-catalog-scan.mjs` → `scripts/solana-catalog-propose.mjs` по живым данным Jupiter и DexScreener (2026-10-02T23:46:43.212Z).
Адреса токенов — только «verified» в Jupiter. **Ничего не одобрено, пока владелец не подтвердит.**

## Правила отбора

- Пул к USDC в приоритете (цена в долларах напрямую). Если пул к USDC тонкий, берём самый глубокий пул к SOL — цена переводится в доллары через SOL/USDC в том же слоте.
- Минимальная ликвидность выбранного пула: крипта $500k, мемы $500k, акции $250k. Чем тоньше пул, тем дешевле сдвинуть цену в момент старта/финиша.
- Только типы пулов, которые умеет читать сервис цен: Raydium AMM v4 / CPMM / CLMM, Orca Whirlpool, Meteora DLMM, PumpSwap.
- Ликвидность и объём — снимок на момент скана; перед mainnet скан повторяется.

## Крипта — предлагается (9)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| SOL | [`58oQCh…YQo2`](https://dexscreener.com/solana/58oqchx4ywmvkdwllzzbi4chocc2fqcuwbkwmihlyqo2) | raydium standard | USDC | $36.7M | $15.4M | `So11111111111111111111111111111111111111112` |
| cbBTC | [`HxA6SK…syLM`](https://dexscreener.com/solana/hxa6skw5qa4o12fjvgtpxdq2ynz5zv1s7sb4ffomsylm) | orca wp | USDC | $6.1M | $22.5M | `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij` |
| WBTC | [`B5EwJV…4PQA`](https://dexscreener.com/solana/b5ewjvduaauzueedwvbuxzbffgeynuqqs37tum1c4pqa) | orca wp | SOL | $2.0M | $5.4M | `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` |
| ETH | [`HktfL7…CcEF`](https://dexscreener.com/solana/hktfl7iwgkt5qhjywqkcdnzxscoh811k7akrmzjkccef) | orca wp | SOL | $6.8M | $8.7M | `7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs` |
| JUP | [`HfgjZD…RHhL`](https://dexscreener.com/solana/hfgjzdmexhfvd28vkb1nbqwwexp3udcvtlpjsghmrhhl) | meteora DLMM | USDC | $519k | $1.3M | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |
| RAY | [`6UmmUi…o1mg`](https://dexscreener.com/solana/6ummuiyobjsrhakaobjw8bvkmjtdvxaebtbt7rxwo1mg) | raydium standard | USDC | $6.7M | $1.0M | `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R` |
| KMNO | [`3ndjN1…3CXK`](https://dexscreener.com/solana/3ndjn1njvukgrjbc1hhvper6kwtzkhdydrpycjyx3cxk) | orca wp | USDC | $2.0M | $3.1M | `KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS` |
| TRUMP | [`3C5YE9…DbW9`](https://dexscreener.com/solana/3c5ye97hadpdxzehyq9cis8axr9anyrusczkze1ndbw9) | meteora DLMM | USDC | $11.8M | $6.6M | `6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN` |
| JLP | [`HD8i7q…cDpj`](https://dexscreener.com/solana/hd8i7qr1hd9ida6sn71rbklxbwcbvzs4na5cy6vfcdpj) | orca wp | USDC | $639k | $321k | `27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4` |

## Мемы — предлагается (13)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| $WIF | [`EP2ib6…eyMx`](https://dexscreener.com/solana/ep2ib6dydeeqd8mfe2ezhcxx3kp3k2elkkirfpm5eymx) | raydium standard | SOL | $6.8M | $880k | `EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm` |
| POPCAT | [`HBS7a3…Z3kS`](https://dexscreener.com/solana/hbs7a3br8gmmwuqva7vb3smfa7xvi1tsfdof5w4zz3ks) | raydium standard | USDC | $643k | $101k | `7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr` |
| PENGU | [`DdMA1c…dvzU`](https://dexscreener.com/solana/ddma1chcheqyfttc1z1sjey978ccu1pyjnutwtnmdvzu) | meteora DLMM | USDC | $4.2M | $5.1M | `2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv` |
| FARTCOIN | [`Bzc9NZ…5iiw`](https://dexscreener.com/solana/bzc9nzfmqkxr6fz1dbph7bdf9broyef6pnzesp7v5iiw) | raydium standard | SOL | $8.8M | $1.5M | `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` |
| MEW | [`879F69…ebce`](https://dexscreener.com/solana/879f697iudjgmevrkrcnw21fcxiaeljk1ffsw2atebce) | raydium standard | SOL | $10.6M | $640k | `MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5` |
| BOME | [`DSUvc5…srmt`](https://dexscreener.com/solana/dsuvc5qf5ljhhv5e2td184ixotsncnwj7i4jja4xsrmt) | raydium standard | SOL | $18.1M | $1.6M | `ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82` |
| MOODENG | [`22Wrmy…8RUd`](https://dexscreener.com/solana/22wrmytj8x2trvqen3fxxi2r4rn6jdhwomtpssmn8rud) | raydium standard | SOL | $3.0M | $192k | `ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY` |
| GIGA | [`4xxM4c…GUar`](https://dexscreener.com/solana/4xxm4cdb6mescxm52xvyqknbzvdewwspdzrbctqvguar) | raydium standard | SOL | $1.8M | $134k | `63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9` |
| PNUT | [`4AZRPN…AY9i`](https://dexscreener.com/solana/4azrpnefcj7iw28rju5auyeqhycvdcnm8cswyl51ay9i) | raydium standard | SOL | $3.7M | $227k | `2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump` |
| USELESS | [`9Ux4vt…cKme`](https://dexscreener.com/solana/9ux4vtd8jueh4nmf4ae3txypkbdecuuipx8z3efickme) | meteora DLMM | USDC | $1.8M | $18k | `Dz9mQ9NzkBcCsuGPFJ3r1bS4wgqKMHBPiVuniW8Mbonk` |
| SPX | [`9t1H1u…TfTR`](https://dexscreener.com/solana/9t1h1udj558impnkepsn1fqkpc4xspq6cqsf6uestftr) | raydium standard | SOL | $2.4M | $299k | `J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr` |
| GOAT | [`9Tb2oh…xVZW`](https://dexscreener.com/solana/9tb2ohu5p16bpbarqd3n27wnkf51ukfs8z1gzzldxvzw) | raydium standard | SOL | $1.8M | $107k | `CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump` |
| CHILLGUY | [`93tjgw…Z7bu`](https://dexscreener.com/solana/93tjgwff5ac5thymi8c4wejvvqq4tumemuyw1leyz7bu) | raydium standard | SOL | $1.6M | $146k | `Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump` |

## Акции (xStocks) — предлагается (13)

| Актив | Пул | Тип | Котировка | Ликвидность | Объём 24ч | Mint токена |
|---|---|---|---|---|---|---|
| NVDAx | [`49iMat…yyw6`](https://dexscreener.com/solana/49imatqtoyabsyaqc8gafvq6aebfvdxsrh44oiatyyw6) | raydium CLMM | USDC | $3.1M | $3.7M | `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh` |
| TSLAx | [`8aDaBQ…NpFF`](https://dexscreener.com/solana/8adabqktrs6hvmjyc6ezebgdiaxhlygridwkwwp1npff) | raydium CLMM | USDC | $2.3M | $1.2M | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` |
| AAPLx | [`CKwJZw…uF8y`](https://dexscreener.com/solana/ckwjzwm7oj3nu4653n1epdrqxbxayxopfipeenlouf8y) | raydium CLMM | USDC | $297k | $258k | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` |
| METAx | [`3L7KbP…t63j`](https://dexscreener.com/solana/3l7kbpvaaqa4utecagqysm6ucq5f3szm9zaykxqyt63j) | raydium CLMM | USDC | $938k | $762k | `Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu` |
| MSTRx | [`RyhF4c…pbGv`](https://dexscreener.com/solana/ryhf4cksvzy7vcqjpoythcxcgnkrp27peghsneppbgv) | raydium CLMM | USDC | $708k | $826k | `XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ` |
| AMZNx | [`6m5aXA…rUiD`](https://dexscreener.com/solana/6m5axave4uh6kt4ytkyclwnmjd8pyp5vujwnctycruid) | raydium CLMM | USDC | $398k | $81k | `Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg` |
| MSFTx | [`CLu4kF…XjsL`](https://dexscreener.com/solana/clu4kfm4nb67xrdn7vjnmxxxir8z5ha4hjuzpfccxjsl) | raydium CLMM | USDC | $886k | $1.8M | `XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX` |
| GOOGLx | [`B8YAwj…obRw`](https://dexscreener.com/solana/b8yawjgyk6qidwzgbxmaxp7nyfg8g74ez3y4gfssobrw) | raydium CLMM | USDC | $784k | $231k | `XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN` |
| COINx | [`w7SGmP…iqxa`](https://dexscreener.com/solana/w7sgmpexomcsjvxqgsamun56uypydsjatsxevkaiqxa) | raydium CLMM | USDC | $1.4M | $788k | `Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu` |
| HOODx | [`DXWbip…7LXs`](https://dexscreener.com/solana/dxwbip5lducmabdssplyz9xik3253epeayqufqtx7lxs) | raydium CLMM | USDC | $1.5M | $591k | `XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg` |
| CRCLx | [`GYqHju…yaFV`](https://dexscreener.com/solana/gyqhjudztiw7i52xv1qohde6ejr6eszpsrbvikgzyafv) | raydium CLMM | USDC | $3.2M | $4.8M | `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1` |
| SPYx | [`6truu3…nDDE`](https://dexscreener.com/solana/6truu3rzuib9rkqg4vyc3dt3qwv7dgwgqxryucrvndde) | raydium CLMM | USDC | $3.0M | $2.2M | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| QQQx | [`GMjGLW…U1aG`](https://dexscreener.com/solana/gmjglwzvk75lpetrgamdexnvxc4fuuqpwjxeqqtdu1ag) | raydium CLMM | USDC | $2.2M | $375k | `Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ` |

## Не прошли отбор

| Категория | Актив | Причина |
|---|---|---|
| crypto | zBTC | liquidity $30k < $500k |
| crypto | JTO | liquidity $72k < $500k |
| crypto | PYTH | liquidity $426k < $500k |
| crypto | HNT | liquidity $425k < $500k |
| crypto | RENDER | liquidity $373k < $500k |
| crypto | W | liquidity $120k < $500k |
| crypto | ORCA | pool kind orca v2 not decodable |
| crypto | DRIFT | liquidity $15k < $500k |
| meme | BONK | liquidity $413k < $500k |
| meme | AI16Z | liquidity $50k < $500k |
| stock | NFLXx | liquidity $10k < $250k |
| stock | AMDx | liquidity $10k < $250k |
| stock | PLTRx | liquidity $142k < $250k |

## Что учесть при утверждении

- **SOL** — актив в гонках и аренах (цена из SOL/USDC), хотя ставки тоже в SOL.
- **Акции xStocks** торгуются 24/7, но базовая биржа работает по расписанию. Вне торговых часов цена пула почти стоит или дрейфует — гонки акций лучше запускать в часы торгов NYSE/Nasdaq.
- **xStocks: freeze authority у эмитента не отключена** (регулируемый токен). Нам это не мешает — мы только читаем цену пула и не держим сами токены.
- Полные адреса пулов и параметры — в `docs/solana-catalog/proposed.json`.

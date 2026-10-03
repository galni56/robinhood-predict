/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/prophet_games.json`.
 */
export type ProphetGames = {
  "address": "G1xjFqQ976m5xsybUCjLxjJxRCcx3PCwpxBgj7VM6ME7",
  "metadata": {
    "name": "prophetGames",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Prophet games: Asset Race and Price Arena in one program"
  },
  "instructions": [
    {
      "name": "acceptAdmin",
      "discriminator": [
        112,
        42,
        45,
        90,
        116,
        181,
        13,
        170
      ],
      "accounts": [
        {
          "name": "newAdmin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "addLobbyAsset",
      "discriminator": [
        218,
        51,
        217,
        13,
        224,
        229,
        242,
        118
      ],
      "accounts": [
        {
          "name": "adder",
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "race",
          "writable": true
        },
        {
          "name": "approvedAsset"
        }
      ],
      "args": []
    },
    {
      "name": "bet",
      "discriminator": [
        94,
        203,
        166,
        126,
        20,
        243,
        169,
        82
      ],
      "accounts": [
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "race",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "race"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "bettorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "assetIndex",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelArenaIfInsufficient",
      "discriminator": [
        134,
        246,
        112,
        103,
        57,
        122,
        117,
        145
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelExpiredArena",
      "discriminator": [
        108,
        63,
        179,
        213,
        68,
        138,
        145,
        46
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelUnstartedRace",
      "discriminator": [
        188,
        38,
        42,
        201,
        189,
        66,
        200,
        34
      ],
      "accounts": [
        {
          "name": "race",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "claimArena",
      "discriminator": [
        1,
        150,
        27,
        216,
        13,
        63,
        243,
        148
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "playerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "claimRace",
      "discriminator": [
        38,
        148,
        77,
        6,
        55,
        37,
        229,
        125
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "race",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "race"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "ownerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "closeLosingPosition",
      "discriminator": [
        156,
        236,
        225,
        41,
        10,
        93,
        74,
        91
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "race",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "race"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "ownerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "createArena",
      "discriminator": [
        174,
        236,
        45,
        61,
        197,
        215,
        149,
        169
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMintConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              }
            ]
          }
        },
        {
          "name": "approvedAsset"
        },
        {
          "name": "arena",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  114,
                  101,
                  110,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "config.arenaCount",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "creatorEarnings",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "associatedTokenProgram",
          "optional": true,
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "stakeMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "createCommunityRace",
      "discriminator": [
        243,
        238,
        201,
        203,
        155,
        33,
        254,
        174
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMintConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              }
            ]
          }
        },
        {
          "name": "race",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.raceCount",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "creatorEarnings",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "associatedTokenProgram",
          "optional": true,
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "category"
            }
          }
        },
        {
          "name": "raceDuration",
          "type": "i64"
        },
        {
          "name": "stakeMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "createPlatformRace",
      "discriminator": [
        66,
        172,
        14,
        148,
        56,
        129,
        179,
        67
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The admin, or the configured race operator."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMintConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "input.stakeMint"
              }
            ]
          }
        },
        {
          "name": "race",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  99,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "config.raceCount",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "creatorEarnings",
          "docs": [
            "Platform races always credit the admin, whoever signs."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "input.stakeMint"
              },
              {
                "kind": "account",
                "path": "config.admin",
                "account": "config"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "associatedTokenProgram",
          "optional": true,
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "input",
          "type": {
            "defined": {
              "name": "platformRaceInput"
            }
          }
        }
      ]
    },
    {
      "name": "enterArena",
      "discriminator": [
        237,
        44,
        241,
        163,
        152,
        39,
        13,
        181
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "playerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "prediction",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "docs": [
            "Only the program's upgrade authority may initialize, so nobody can",
            "front-run the deploy and take the admin role."
          ],
          "address": "G1xjFqQ976m5xsybUCjLxjJxRCcx3PCwpxBgj7VM6ME7"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "oracleSigner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "openBetting",
      "discriminator": [
        56,
        252,
        59,
        239,
        115,
        210,
        82,
        222
      ],
      "accounts": [
        {
          "name": "race",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "proposeAdmin",
      "discriminator": [
        121,
        214,
        199,
        212,
        87,
        39,
        117,
        234
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "refundArena",
      "discriminator": [
        81,
        137,
        215,
        141,
        224,
        218,
        23,
        204
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "playerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "refundRace",
      "discriminator": [
        95,
        37,
        129,
        205,
        64,
        76,
        61,
        109
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "race",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "race"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "ownerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "resolveArena",
      "discriminator": [
        213,
        151,
        76,
        78,
        209,
        87,
        214,
        114
      ],
      "accounts": [
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "arena.stakeMint",
                "account": "arena"
              }
            ]
          }
        },
        {
          "name": "creatorEarnings",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "arena.stakeMint",
                "account": "arena"
              },
              {
                "kind": "account",
                "path": "arena.creator",
                "account": "arena"
              }
            ]
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "resolveRace",
      "discriminator": [
        181,
        252,
        7,
        209,
        242,
        100,
        95,
        172
      ],
      "accounts": [
        {
          "name": "race",
          "writable": true
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "race.stakeMint",
                "account": "race"
              }
            ]
          }
        },
        {
          "name": "creatorEarnings",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "race.stakeMint",
                "account": "race"
              },
              {
                "kind": "account",
                "path": "race.creator",
                "account": "race"
              }
            ]
          }
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "raceVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": []
    },
    {
      "name": "setApprovedAsset",
      "discriminator": [
        57,
        198,
        92,
        205,
        48,
        116,
        171,
        116
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "approvedAsset",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "assetId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "assetId",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "category",
          "type": {
            "defined": {
              "name": "category"
            }
          }
        },
        {
          "name": "priceSource",
          "type": "pubkey"
        },
        {
          "name": "priceDecimals",
          "type": "u8"
        },
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setCommunityPolicy",
      "discriminator": [
        49,
        244,
        8,
        142,
        50,
        174,
        90,
        173
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "policy",
          "type": {
            "defined": {
              "name": "communityPolicy"
            }
          }
        }
      ]
    },
    {
      "name": "setDurationPreset",
      "discriminator": [
        80,
        201,
        81,
        251,
        183,
        234,
        103,
        106
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "duration",
          "type": "i64"
        },
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setOracleSigner",
      "discriminator": [
        53,
        93,
        91,
        204,
        166,
        101,
        228,
        64
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "oracleSigner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setRaceOperator",
      "discriminator": [
        61,
        115,
        249,
        73,
        88,
        178,
        108,
        147
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "raceOperator",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "setStakeMint",
      "discriminator": [
        98,
        90,
        126,
        218,
        121,
        228,
        110,
        87
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "stakeMintConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "associatedTokenProgram",
          "optional": true,
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "stakeMint",
          "type": "pubkey"
        },
        {
          "name": "enabled",
          "type": "bool"
        },
        {
          "name": "minStake",
          "type": "u64"
        },
        {
          "name": "maxStake",
          "type": "u64"
        }
      ]
    },
    {
      "name": "startRace",
      "discriminator": [
        167,
        209,
        181,
        53,
        90,
        108,
        220,
        120
      ],
      "accounts": [
        {
          "name": "race",
          "writable": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "updateArenaEntry",
      "discriminator": [
        131,
        64,
        111,
        16,
        219,
        237,
        207,
        139
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "arena",
          "writable": true
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "playerToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "arenaVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "newPrediction",
          "type": "u64"
        },
        {
          "name": "additionalAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "voidExpiredRace",
      "discriminator": [
        87,
        137,
        52,
        7,
        22,
        181,
        233,
        38
      ],
      "accounts": [
        {
          "name": "race",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "withdrawCreatorFees",
      "discriminator": [
        8,
        30,
        213,
        18,
        121,
        105,
        129,
        222
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "creatorEarnings"
          ]
        },
        {
          "name": "creatorEarnings",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              },
              {
                "kind": "account",
                "path": "creator"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "creatorVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "creatorToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "stakeMint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "stakeMint"
              }
            ]
          }
        },
        {
          "name": "recipient",
          "writable": true
        },
        {
          "name": "tokenMint",
          "optional": true
        },
        {
          "name": "treasuryVault",
          "writable": true,
          "optional": true
        },
        {
          "name": "recipientToken",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "stakeMint",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "approvedAsset",
      "discriminator": [
        187,
        133,
        252,
        71,
        239,
        199,
        204,
        13
      ]
    },
    {
      "name": "arena",
      "discriminator": [
        243,
        215,
        44,
        44,
        231,
        211,
        232,
        168
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "creatorEarnings",
      "discriminator": [
        177,
        131,
        174,
        106,
        74,
        6,
        231,
        77
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    },
    {
      "name": "race",
      "discriminator": [
        114,
        93,
        186,
        119,
        99,
        123,
        162,
        192
      ]
    },
    {
      "name": "stakeMintConfig",
      "discriminator": [
        135,
        11,
        233,
        41,
        244,
        88,
        12,
        197
      ]
    },
    {
      "name": "treasury",
      "discriminator": [
        238,
        239,
        123,
        238,
        89,
        1,
        168,
        253
      ]
    }
  ],
  "events": [
    {
      "name": "activityPausedSet",
      "discriminator": [
        22,
        119,
        58,
        11,
        192,
        254,
        16,
        82
      ]
    },
    {
      "name": "approvedAssetSet",
      "discriminator": [
        232,
        211,
        95,
        47,
        211,
        155,
        24,
        208
      ]
    },
    {
      "name": "arenaCancelled",
      "discriminator": [
        78,
        72,
        160,
        220,
        199,
        234,
        70,
        227
      ]
    },
    {
      "name": "arenaClaimed",
      "discriminator": [
        241,
        120,
        190,
        130,
        13,
        115,
        58,
        26
      ]
    },
    {
      "name": "arenaCreated",
      "discriminator": [
        93,
        57,
        84,
        96,
        112,
        3,
        148,
        17
      ]
    },
    {
      "name": "arenaRefunded",
      "discriminator": [
        16,
        111,
        130,
        219,
        150,
        46,
        80,
        239
      ]
    },
    {
      "name": "arenaResolved",
      "discriminator": [
        215,
        134,
        169,
        36,
        117,
        11,
        42,
        218
      ]
    },
    {
      "name": "betPlaced",
      "discriminator": [
        88,
        88,
        145,
        226,
        126,
        206,
        32,
        0
      ]
    },
    {
      "name": "bettingOpened",
      "discriminator": [
        49,
        81,
        48,
        194,
        45,
        153,
        35,
        10
      ]
    },
    {
      "name": "creatorFeesWithdrawn",
      "discriminator": [
        142,
        52,
        192,
        191,
        6,
        90,
        253,
        62
      ]
    },
    {
      "name": "entryChanged",
      "discriminator": [
        228,
        20,
        252,
        83,
        45,
        22,
        163,
        142
      ]
    },
    {
      "name": "feesWithdrawn",
      "discriminator": [
        234,
        15,
        0,
        119,
        148,
        241,
        40,
        21
      ]
    },
    {
      "name": "lobbyAssetAdded",
      "discriminator": [
        85,
        145,
        31,
        116,
        29,
        121,
        60,
        124
      ]
    },
    {
      "name": "raceCancelled",
      "discriminator": [
        211,
        217,
        124,
        48,
        45,
        246,
        250,
        44
      ]
    },
    {
      "name": "raceClaimed",
      "discriminator": [
        207,
        115,
        60,
        109,
        152,
        158,
        126,
        191
      ]
    },
    {
      "name": "raceCreated",
      "discriminator": [
        92,
        229,
        121,
        9,
        205,
        210,
        225,
        9
      ]
    },
    {
      "name": "raceOperatorSet",
      "discriminator": [
        224,
        199,
        44,
        33,
        202,
        70,
        199,
        125
      ]
    },
    {
      "name": "raceRefunded",
      "discriminator": [
        31,
        45,
        45,
        66,
        176,
        118,
        125,
        54
      ]
    },
    {
      "name": "raceResolved",
      "discriminator": [
        45,
        151,
        108,
        227,
        64,
        209,
        32,
        144
      ]
    },
    {
      "name": "raceStarted",
      "discriminator": [
        217,
        237,
        93,
        167,
        114,
        201,
        150,
        92
      ]
    },
    {
      "name": "raceVoided",
      "discriminator": [
        171,
        91,
        59,
        102,
        122,
        162,
        81,
        250
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6001,
      "name": "activityPaused",
      "msg": "New games and bets are paused"
    },
    {
      "code": 6002,
      "name": "invalidConfiguration",
      "msg": "Invalid configuration"
    },
    {
      "code": 6003,
      "name": "invalidTitle",
      "msg": "Title must be 1-64 bytes with at least one visible character"
    },
    {
      "code": 6004,
      "name": "invalidCandidate",
      "msg": "Invalid asset"
    },
    {
      "code": 6005,
      "name": "assetNotApproved",
      "msg": "Asset is not approved for this category"
    },
    {
      "code": 6006,
      "name": "unsupportedStakeMint",
      "msg": "Stake mint is not supported"
    },
    {
      "code": 6007,
      "name": "amountZero",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6008,
      "name": "lobbyClosed",
      "msg": "Lobby is closed"
    },
    {
      "code": 6009,
      "name": "lobbyStillOpen",
      "msg": "Lobby is still open"
    },
    {
      "code": 6010,
      "name": "resolutionWindowExpired",
      "msg": "Resolution window has expired"
    },
    {
      "code": 6011,
      "name": "resolutionWindowStillOpen",
      "msg": "Resolution window is still open"
    },
    {
      "code": 6012,
      "name": "insufficientFeeBalance",
      "msg": "Fee balance is too low"
    },
    {
      "code": 6013,
      "name": "insufficientEscrow",
      "msg": "Escrow balance is too low"
    },
    {
      "code": 6014,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6015,
      "name": "noPendingAdmin",
      "msg": "No pending admin"
    },
    {
      "code": 6016,
      "name": "missingSignatureInstruction",
      "msg": "Expected an Ed25519 signature instruction immediately before this one"
    },
    {
      "code": 6017,
      "name": "invalidSignatureInstruction",
      "msg": "Malformed Ed25519 signature instruction"
    },
    {
      "code": 6018,
      "name": "invalidAttestationSigner",
      "msg": "Price attestation was not signed by the game's oracle signer"
    },
    {
      "code": 6019,
      "name": "invalidAttestation",
      "msg": "Malformed price attestation"
    },
    {
      "code": 6020,
      "name": "invalidAttestationBoundary",
      "msg": "Price attestation does not prove the target time boundary"
    },
    {
      "code": 6021,
      "name": "missingAssetPrice",
      "msg": "Price attestation is missing a required asset"
    },
    {
      "code": 6022,
      "name": "invalidOraclePrice",
      "msg": "Invalid oracle price"
    },
    {
      "code": 6023,
      "name": "invalidOracleDecimals",
      "msg": "Oracle price decimals do not match the asset"
    },
    {
      "code": 6024,
      "name": "feeExceedsMaximum",
      "msg": "Fee exceeds the maximum"
    },
    {
      "code": 6025,
      "name": "invalidCandidateCount",
      "msg": "A race needs 2-6 assets"
    },
    {
      "code": 6026,
      "name": "duplicateAsset",
      "msg": "Asset is already in this race"
    },
    {
      "code": 6027,
      "name": "duplicatePriceSource",
      "msg": "Price source is already used by another asset in this race"
    },
    {
      "code": 6028,
      "name": "durationNotApproved",
      "msg": "Race duration is not an approved preset"
    },
    {
      "code": 6029,
      "name": "communityPolicyNotConfigured",
      "msg": "Community races are not configured"
    },
    {
      "code": 6030,
      "name": "tooManyDurationPresets",
      "msg": "Too many race duration presets"
    },
    {
      "code": 6031,
      "name": "invalidRaceStatus",
      "msg": "Race is not in the required status"
    },
    {
      "code": 6032,
      "name": "lobbyAdditionAlreadyUsed",
      "msg": "This wallet already added an asset to the lobby"
    },
    {
      "code": 6033,
      "name": "bettingNotOpen",
      "msg": "Betting is not open"
    },
    {
      "code": 6034,
      "name": "stakeBelowMinimum",
      "msg": "Stake is below the race minimum"
    },
    {
      "code": 6035,
      "name": "stakeExceedsMaximum",
      "msg": "Stake exceeds the per-wallet maximum"
    },
    {
      "code": 6036,
      "name": "wrongAsset",
      "msg": "A wallet can back only one asset per race"
    },
    {
      "code": 6037,
      "name": "startTooEarly",
      "msg": "Race cannot start before betting ends"
    },
    {
      "code": 6038,
      "name": "startWindowExpired",
      "msg": "Start window has expired"
    },
    {
      "code": 6039,
      "name": "startWindowStillOpen",
      "msg": "Start window is still open"
    },
    {
      "code": 6040,
      "name": "resolutionTooEarly",
      "msg": "Race has not ended yet"
    },
    {
      "code": 6041,
      "name": "noWinningPosition",
      "msg": "No winning position"
    },
    {
      "code": 6042,
      "name": "notLosingPosition",
      "msg": "Only a losing position can be closed this way"
    },
    {
      "code": 6043,
      "name": "unsupportedDuration",
      "msg": "Unsupported arena duration"
    },
    {
      "code": 6044,
      "name": "arenaNotOpen",
      "msg": "Arena is not open"
    },
    {
      "code": 6045,
      "name": "arenaFull",
      "msg": "Arena is full"
    },
    {
      "code": 6046,
      "name": "alreadyEntered",
      "msg": "Wallet already entered this arena"
    },
    {
      "code": 6047,
      "name": "notEntered",
      "msg": "Wallet has not entered this arena"
    },
    {
      "code": 6048,
      "name": "invalidPrediction",
      "msg": "Prediction must be greater than zero"
    },
    {
      "code": 6049,
      "name": "invalidStake",
      "msg": "Stake is outside the arena limits"
    },
    {
      "code": 6050,
      "name": "nothingChanged",
      "msg": "Nothing changed"
    },
    {
      "code": 6051,
      "name": "enoughParticipants",
      "msg": "Arena has enough participants"
    },
    {
      "code": 6052,
      "name": "tooEarly",
      "msg": "Arena deadline has not passed"
    },
    {
      "code": 6053,
      "name": "noWinningPayout",
      "msg": "No winning payout"
    },
    {
      "code": 6054,
      "name": "alreadySettled",
      "msg": "Already settled"
    },
    {
      "code": 6055,
      "name": "arenaNotCancelled",
      "msg": "Arena is not cancelled"
    },
    {
      "code": 6056,
      "name": "arenaNotResolved",
      "msg": "Arena is not resolved"
    }
  ],
  "types": [
    {
      "name": "activityPausedSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "approvedAsset",
      "docs": [
        "Protocol-reviewed asset, shared by both games. `price_source` identifies",
        "the frozen pool the price service reads; attestation entries key on it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "priceSource",
            "type": "pubkey"
          },
          {
            "name": "priceDecimals",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "approvedAssetSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "priceSource",
            "type": "pubkey"
          },
          {
            "name": "priceDecimals",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arena",
      "docs": [
        "One arena. The account itself escrows every native-SOL stake placed on it,",
        "and holds all (at most ten) entries so resolution fits in one transaction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "priceSource",
            "type": "pubkey"
          },
          {
            "name": "priceDecimals",
            "type": "u8"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "oracleSigner",
            "docs": [
              "Snapshotted at creation so later signer rotation cannot affect this arena."
            ],
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "arenaStatus"
              }
            }
          },
          {
            "name": "cancelReason",
            "type": {
              "defined": {
                "name": "arenaCancelReason"
              }
            }
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "duration",
            "type": "i64"
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          },
          {
            "name": "feeBp",
            "type": "u16"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "maxStake",
            "type": "u64"
          },
          {
            "name": "totalPool",
            "type": "u64"
          },
          {
            "name": "finalPrice",
            "type": "u64"
          },
          {
            "name": "finalSlot",
            "type": "u64"
          },
          {
            "name": "finalPriceTime",
            "type": "i64"
          },
          {
            "name": "winnerCount",
            "type": "u8"
          },
          {
            "name": "protocolFee",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "remainingLiability",
            "docs": [
              "Payouts or refunds still owed to players from this escrow."
            ],
            "type": "u64"
          },
          {
            "name": "nextPredictionSeq",
            "type": "u32"
          },
          {
            "name": "entries",
            "type": {
              "vec": {
                "defined": {
                  "name": "entry"
                }
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "arenaCancelReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "insufficientParticipants"
          },
          {
            "name": "staleDeadlinePrice"
          },
          {
            "name": "resolutionWindowExpired"
          }
        ]
      }
    },
    {
      "name": "arenaCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "arenaCancelReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "arenaClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "arenaCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "arenaId",
            "type": "u64"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "startsAt",
            "type": "i64"
          },
          {
            "name": "deadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "arenaRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "arenaResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "finalPrice",
            "type": "u64"
          },
          {
            "name": "winnerCount",
            "type": "u8"
          },
          {
            "name": "protocolFee",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "arenaStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolved"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "betPlaced",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "bettor",
            "type": "pubkey"
          },
          {
            "name": "assetIndex",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalStake",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "bettingOpened",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "bettingStartTime",
            "type": "i64"
          },
          {
            "name": "bettingEndTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "category",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "stock"
          },
          {
            "name": "meme"
          },
          {
            "name": "crypto"
          }
        ]
      }
    },
    {
      "name": "communityPolicy",
      "docs": [
        "Rules every community race inherits; the creator picks only title,",
        "category, an approved duration, the stake currency and initial assets."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "lobbyDuration",
            "type": "i64"
          },
          {
            "name": "bettingDuration",
            "type": "i64"
          },
          {
            "name": "startGrace",
            "type": "i64"
          },
          {
            "name": "resolutionGrace",
            "type": "i64"
          },
          {
            "name": "feeBp",
            "type": "u16"
          },
          {
            "name": "minActiveContenders",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "pendingAdmin",
            "docs": [
              "Two-step admin handover; `Pubkey::default()` when none is pending."
            ],
            "type": "pubkey"
          },
          {
            "name": "oracleSigner",
            "docs": [
              "Ed25519 key whose pool attestations new games will trust."
            ],
            "type": "pubkey"
          },
          {
            "name": "raceOperator",
            "docs": [
              "Optional hot key (the race scheduler) that may create platform races",
              "and nothing else; their creator fees still accrue to the admin.",
              "`Pubkey::default()` when unset."
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Pauses only creation and new bets/entries. Lifecycle, claims and refunds stay open."
            ],
            "type": "bool"
          },
          {
            "name": "raceCount",
            "type": "u64"
          },
          {
            "name": "arenaCount",
            "type": "u64"
          },
          {
            "name": "communityPolicyConfigured",
            "type": "bool"
          },
          {
            "name": "communityPolicy",
            "type": {
              "defined": {
                "name": "communityPolicy"
              }
            }
          },
          {
            "name": "raceDurations",
            "type": {
              "vec": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creatorEarnings",
      "docs": [
        "Creator revenue for one (stake mint, creator) across races and arenas.",
        "Pull-based so a resolve never fails because a creator cannot receive funds."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalEarned",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "creatorFeesWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "entry",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "prediction",
            "docs": [
              "Not secret: account data is public. Clients hide it during the lobby."
            ],
            "type": "u64"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "predictionUpdatedAt",
            "type": "i64"
          },
          {
            "name": "predictionSeq",
            "docs": [
              "Arena-local order of the last prediction change; lower ranks first on",
              "equal error. A pure top-up keeps it."
            ],
            "type": "u32"
          },
          {
            "name": "payout",
            "type": "u64"
          },
          {
            "name": "rank",
            "docs": [
              "1-based final rank, `NO_RANK` until resolved."
            ],
            "type": "u8"
          },
          {
            "name": "accuracyMultiplierBp",
            "type": "u32"
          },
          {
            "name": "settled",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "entryChanged",
      "docs": [
        "Deliberately omits the prediction (it is still public in account data)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "arena",
            "type": "pubkey"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "totalStake",
            "type": "u64"
          },
          {
            "name": "predictionChanged",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "feesWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lobbyAssetAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "addedBy",
            "type": "pubkey"
          },
          {
            "name": "assetIndex",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "origin",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "platform"
          },
          {
            "name": "community"
          }
        ]
      }
    },
    {
      "name": "platformRaceInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "stakeMint",
            "docs": [
              "`NATIVE_SOL` or an accepted SPL mint."
            ],
            "type": "pubkey"
          },
          {
            "name": "bettingStartTime",
            "type": "i64"
          },
          {
            "name": "bettingEndTime",
            "type": "i64"
          },
          {
            "name": "raceDuration",
            "type": "i64"
          },
          {
            "name": "startGrace",
            "type": "i64"
          },
          {
            "name": "resolutionGrace",
            "type": "i64"
          },
          {
            "name": "feeBp",
            "type": "u16"
          },
          {
            "name": "minActiveContenders",
            "type": "u8"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "maxStakePerWallet",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "assetIndex",
            "type": "u8"
          },
          {
            "name": "stake",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "race",
      "docs": [
        "One race. The account itself escrows every native-SOL stake placed on it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "origin",
            "type": {
              "defined": {
                "name": "origin"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "raceStatus"
              }
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "oracleSigner",
            "docs": [
              "Snapshotted at creation so later signer rotation cannot affect this race."
            ],
            "type": "pubkey"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "lobbyEndTime",
            "type": "i64"
          },
          {
            "name": "bettingWindow",
            "type": "i64"
          },
          {
            "name": "bettingStartTime",
            "type": "i64"
          },
          {
            "name": "bettingEndTime",
            "type": "i64"
          },
          {
            "name": "raceDuration",
            "type": "i64"
          },
          {
            "name": "raceEndTime",
            "type": "i64"
          },
          {
            "name": "startGrace",
            "type": "i64"
          },
          {
            "name": "resolutionGrace",
            "type": "i64"
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          },
          {
            "name": "feeBp",
            "type": "u16"
          },
          {
            "name": "minActiveContenders",
            "type": "u8"
          },
          {
            "name": "activeCount",
            "type": "u8"
          },
          {
            "name": "winningAssetIndex",
            "type": "u8"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "maxStakePerWallet",
            "type": "u64"
          },
          {
            "name": "totalPool",
            "type": "u64"
          },
          {
            "name": "winningPool",
            "type": "u64"
          },
          {
            "name": "distributableLosingPool",
            "type": "u64"
          },
          {
            "name": "protocolFee",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          },
          {
            "name": "remainingLiability",
            "docs": [
              "Stakes and winnings still owed to bettors from this escrow."
            ],
            "type": "u64"
          },
          {
            "name": "startSlot",
            "type": "u64"
          },
          {
            "name": "startPriceTime",
            "type": "i64"
          },
          {
            "name": "endSlot",
            "type": "u64"
          },
          {
            "name": "endPriceTime",
            "type": "i64"
          },
          {
            "name": "assets",
            "type": {
              "vec": {
                "defined": {
                  "name": "raceAsset"
                }
              }
            }
          },
          {
            "name": "lobbyAdders",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raceAsset",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assetId",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "priceSource",
            "type": "pubkey"
          },
          {
            "name": "priceDecimals",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "pool",
            "type": "u64"
          },
          {
            "name": "startPrice",
            "type": "u64"
          },
          {
            "name": "endPrice",
            "type": "u64"
          },
          {
            "name": "returnValue",
            "docs": [
              "Percentage return scaled by `RETURN_SCALE`."
            ],
            "type": "i128"
          }
        ]
      }
    },
    {
      "name": "raceCancelReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "insufficientActiveContenders"
          },
          {
            "name": "startWindowExpired"
          },
          {
            "name": "insufficientLobbyAssets"
          }
        ]
      }
    },
    {
      "name": "raceCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "raceCancelReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "raceClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "payout",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "raceCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "raceId",
            "type": "u64"
          },
          {
            "name": "origin",
            "type": {
              "defined": {
                "name": "origin"
              }
            }
          },
          {
            "name": "category",
            "type": {
              "defined": {
                "name": "category"
              }
            }
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "assetCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raceOperatorSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raceOperator",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "raceRefunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "raceResolved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "winningAssetIndex",
            "type": "u8"
          },
          {
            "name": "winningReturn",
            "type": "i128"
          },
          {
            "name": "winningPool",
            "type": "u64"
          },
          {
            "name": "protocolFee",
            "type": "u64"
          },
          {
            "name": "creatorFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "raceStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "startSlot",
            "type": "u64"
          },
          {
            "name": "raceEndTime",
            "type": "i64"
          },
          {
            "name": "activeCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "raceStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "lobby"
          },
          {
            "name": "betting"
          },
          {
            "name": "running"
          },
          {
            "name": "resolved"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "raceVoided",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "race",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": {
              "defined": {
                "name": "voidReason"
              }
            }
          }
        ]
      }
    },
    {
      "name": "stakeMintConfig",
      "docs": [
        "An accepted stake currency: native SOL (`NATIVE_SOL`) or an SPL mint. Its",
        "limits apply to community races and arenas created with it."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "enabled",
            "type": "bool"
          },
          {
            "name": "minStake",
            "type": "u64"
          },
          {
            "name": "maxStake",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "treasury",
      "docs": [
        "Protocol fee balance for one stake mint, shared by both games: lamports",
        "above rent for native SOL, or the balance of its vault for an SPL mint."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stakeMint",
            "type": "pubkey"
          },
          {
            "name": "accumulatedFees",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "voidReason",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "topTie"
          },
          {
            "name": "resolutionWindowExpired"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "arenaSeed",
      "type": "bytes",
      "value": "[97, 114, 101, 110, 97]"
    },
    {
      "name": "assetSeed",
      "type": "bytes",
      "value": "[97, 115, 115, 101, 116]"
    },
    {
      "name": "configSeed",
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "creatorSeed",
      "type": "bytes",
      "value": "[99, 114, 101, 97, 116, 111, 114]"
    },
    {
      "name": "positionSeed",
      "type": "bytes",
      "value": "[112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "raceSeed",
      "type": "bytes",
      "value": "[114, 97, 99, 101]"
    },
    {
      "name": "stakeMintSeed",
      "type": "bytes",
      "value": "[115, 116, 97, 107, 101, 95, 109, 105, 110, 116]"
    },
    {
      "name": "treasurySeed",
      "type": "bytes",
      "value": "[116, 114, 101, 97, 115, 117, 114, 121]"
    }
  ]
};

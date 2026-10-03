/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/price_arena.json`.
 */
export type PriceArena = {
  "address": "GWdUNY9nzmMCSUfNSsvQCZFzwGNrqDKeh5TdHg79DaQU",
  "metadata": {
    "name": "priceArena",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Prophet Price Arena: closest-half-wins price prediction contests"
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
      "name": "cancelIfInsufficient",
      "discriminator": [
        99,
        237,
        68,
        77,
        7,
        158,
        240,
        95
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
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
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
      "name": "enter",
      "discriminator": [
        139,
        49,
        209,
        114,
        88,
        91,
        77,
        134
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
          "address": "GWdUNY9nzmMCSUfNSsvQCZFzwGNrqDKeh5TdHg79DaQU"
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
      "name": "refund",
      "discriminator": [
        2,
        96,
        183,
        251,
        63,
        208,
        46,
        46
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
      "name": "resolve",
      "discriminator": [
        246,
        150,
        236,
        206,
        108,
        63,
        58,
        10
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
      "name": "updateEntry",
      "discriminator": [
        70,
        47,
        181,
        2,
        1,
        40,
        2,
        92
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
      "name": "claimed",
      "discriminator": [
        217,
        192,
        123,
        72,
        108,
        150,
        248,
        33
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
      "name": "refunded",
      "discriminator": [
        35,
        103,
        149,
        246,
        196,
        123,
        221,
        99
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
      "msg": "New arenas and entries are paused"
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
      "name": "invalidAsset",
      "msg": "Invalid asset"
    },
    {
      "code": 6005,
      "name": "assetNotApproved",
      "msg": "Asset is not approved for this category"
    },
    {
      "code": 6006,
      "name": "unsupportedDuration",
      "msg": "Unsupported arena duration"
    },
    {
      "code": 6007,
      "name": "arenaNotOpen",
      "msg": "Arena is not open"
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
      "name": "arenaFull",
      "msg": "Arena is full"
    },
    {
      "code": 6011,
      "name": "alreadyEntered",
      "msg": "Wallet already entered this arena"
    },
    {
      "code": 6012,
      "name": "notEntered",
      "msg": "Wallet has not entered this arena"
    },
    {
      "code": 6013,
      "name": "invalidPrediction",
      "msg": "Prediction must be greater than zero"
    },
    {
      "code": 6014,
      "name": "invalidStake",
      "msg": "Stake is outside the arena limits"
    },
    {
      "code": 6015,
      "name": "nothingChanged",
      "msg": "Nothing changed"
    },
    {
      "code": 6016,
      "name": "enoughParticipants",
      "msg": "Arena has enough participants"
    },
    {
      "code": 6017,
      "name": "tooEarly",
      "msg": "Arena deadline has not passed"
    },
    {
      "code": 6018,
      "name": "resolutionWindowExpired",
      "msg": "Resolution window has expired"
    },
    {
      "code": 6019,
      "name": "resolutionWindowStillOpen",
      "msg": "Resolution window is still open"
    },
    {
      "code": 6020,
      "name": "unsupportedStakeMint",
      "msg": "Stake mint is not supported yet"
    },
    {
      "code": 6021,
      "name": "missingSignatureInstruction",
      "msg": "Expected an Ed25519 signature instruction immediately before this one"
    },
    {
      "code": 6022,
      "name": "invalidSignatureInstruction",
      "msg": "Malformed Ed25519 signature instruction"
    },
    {
      "code": 6023,
      "name": "invalidAttestationSigner",
      "msg": "Price attestation was not signed by the arena oracle signer"
    },
    {
      "code": 6024,
      "name": "invalidAttestation",
      "msg": "Malformed price attestation"
    },
    {
      "code": 6025,
      "name": "invalidAttestationBoundary",
      "msg": "Price attestation does not prove the deadline boundary"
    },
    {
      "code": 6026,
      "name": "missingAssetPrice",
      "msg": "Price attestation is missing the arena asset"
    },
    {
      "code": 6027,
      "name": "invalidOracleDecimals",
      "msg": "Oracle price decimals do not match the asset"
    },
    {
      "code": 6028,
      "name": "invalidOraclePrice",
      "msg": "Invalid oracle price"
    },
    {
      "code": 6029,
      "name": "noWinningPayout",
      "msg": "No winning payout"
    },
    {
      "code": 6030,
      "name": "alreadySettled",
      "msg": "Already settled"
    },
    {
      "code": 6031,
      "name": "arenaNotCancelled",
      "msg": "Arena is not cancelled"
    },
    {
      "code": 6032,
      "name": "arenaNotResolved",
      "msg": "Arena is not resolved"
    },
    {
      "code": 6033,
      "name": "amountZero",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6034,
      "name": "insufficientFeeBalance",
      "msg": "Fee balance is too low"
    },
    {
      "code": 6035,
      "name": "insufficientEscrow",
      "msg": "Escrow balance is too low"
    },
    {
      "code": 6036,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6037,
      "name": "noPendingAdmin",
      "msg": "No pending admin"
    }
  ],
  "types": [
    {
      "name": "approvedAsset",
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
                "name": "cancelReason"
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
                "name": "cancelReason"
              }
            }
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
      "name": "cancelReason",
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
      "name": "claimed",
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
              "Ed25519 key whose pool attestations new arenas will trust."
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Pauses only creation and new entries. Resolution, claims and refunds stay open."
            ],
            "type": "bool"
          },
          {
            "name": "arenaCount",
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
      "name": "creatorEarnings",
      "docs": [
        "Creator revenue for one (stake mint, creator). Pull-based."
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
      "name": "refunded",
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
      "name": "stakeMintConfig",
      "docs": [
        "An accepted stake currency: native SOL (`NATIVE_SOL`) or an SPL mint, with",
        "the per-player stake bounds snapshotted into each new arena."
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
        "Fee balance for one stake mint: lamports above rent for native SOL, or the",
        "balance of its vault (associated token account) for an SPL mint."
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

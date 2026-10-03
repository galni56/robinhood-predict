/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/nickname_registry.json`.
 */
export type NicknameRegistry = {
  "address": "9hbJLs2EGPdvVLcxQs2N2QqZUhh8r2J86PK8rYBRxJdt",
  "metadata": {
    "name": "nicknameRegistry",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Prophet nickname registry: every wallet sets only its own display name"
  },
  "instructions": [
    {
      "name": "clearNickname",
      "docs": [
        "Clears the signer's nickname and returns the account rent."
      ],
      "discriminator": [
        198,
        92,
        142,
        235,
        13,
        214,
        180,
        62
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true,
          "relations": [
            "nickname"
          ]
        },
        {
          "name": "nickname",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  105,
                  99,
                  107,
                  110,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "setNickname",
      "docs": [
        "Sets or replaces the signer's own nickname."
      ],
      "discriminator": [
        213,
        22,
        78,
        19,
        90,
        40,
        35,
        13
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "nickname",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  105,
                  99,
                  107,
                  110,
                  97,
                  109,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
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
          "name": "nickname",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "nickname",
      "discriminator": [
        239,
        238,
        59,
        147,
        4,
        54,
        73,
        203
      ]
    }
  ],
  "events": [
    {
      "name": "nicknameSet",
      "discriminator": [
        171,
        88,
        211,
        228,
        45,
        45,
        243,
        164
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "nicknameTooLong",
      "msg": "Nickname is longer than 24 bytes"
    },
    {
      "code": 6001,
      "name": "emptyNickname",
      "msg": "Use clear_nickname to remove a nickname"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Signer does not own this nickname"
    }
  ],
  "types": [
    {
      "name": "nickname",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nickname",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nicknameSet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "nickname",
            "type": "string"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "nicknameSeed",
      "type": "bytes",
      "value": "[110, 105, 99, 107, 110, 97, 109, 101]"
    }
  ]
};

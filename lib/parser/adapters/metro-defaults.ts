/** Pinned application-owned Metro profiles; see FS-07 independent defaults oracles. */
export const METRO_DEFAULTS = {
  "rn83-bare": {
    "tool": "@react-native/metro-config",
    "version": "0.83.10",
    "sourceHash": "bd2c710faa94603fc8f015356f423c1488cb432a5e5b3542e8285dd25d7998c7",
    "outputHash": "0745d8362f8ad88febbc05117e4e1cca76b653902cfff5e3e322a2ab03192d53",
    "sourceExts": [
      "js",
      "jsx",
      "json",
      "ts",
      "tsx"
    ],
    "assetExts": [
      "bmp",
      "gif",
      "jpg",
      "jpeg",
      "png",
      "psd",
      "svg",
      "webp",
      "xml",
      "m4v",
      "mov",
      "mp4",
      "mpeg",
      "mpg",
      "webm",
      "aac",
      "aiff",
      "caf",
      "m4a",
      "mp3",
      "wav",
      "html",
      "pdf",
      "yaml",
      "yml",
      "otf",
      "ttf",
      "zip"
    ],
    "resolverMainFields": [
      "react-native",
      "browser",
      "main"
    ],
    "unstable_conditionNames": [
      "react-native"
    ],
    "unstable_conditionsByPlatform": {
      "web": [
        "browser"
      ]
    },
    "unstable_enablePackageExports": true,
    "platforms": [
      "android",
      "ios"
    ]
  },
  "rn85-bare": {
    "tool": "@react-native/metro-config",
    "version": "0.85.3",
    "sourceHash": "bd2c710faa94603fc8f015356f423c1488cb432a5e5b3542e8285dd25d7998c7",
    "outputHash": "0745d8362f8ad88febbc05117e4e1cca76b653902cfff5e3e322a2ab03192d53",
    "sourceExts": [
      "js",
      "jsx",
      "json",
      "ts",
      "tsx"
    ],
    "assetExts": [
      "bmp",
      "gif",
      "jpg",
      "jpeg",
      "png",
      "psd",
      "svg",
      "webp",
      "xml",
      "m4v",
      "mov",
      "mp4",
      "mpeg",
      "mpg",
      "webm",
      "aac",
      "aiff",
      "caf",
      "m4a",
      "mp3",
      "wav",
      "html",
      "pdf",
      "yaml",
      "yml",
      "otf",
      "ttf",
      "zip"
    ],
    "resolverMainFields": [
      "react-native",
      "browser",
      "main"
    ],
    "unstable_conditionNames": [
      "react-native"
    ],
    "unstable_conditionsByPlatform": {
      "web": [
        "browser"
      ]
    },
    "unstable_enablePackageExports": true,
    "platforms": [
      "android",
      "ios"
    ]
  },
  "expo55": {
    "tool": "@expo/metro-config",
    "version": "55.0.27",
    "sourceHash": "b521085df335b51dfc707b2cacc356460730dfb8ff3d588af187cfb4099f1db7",
    "outputHash": "9049627ae3cbea259d44c276b91d4a9cb36dedf9e25184c6b4f193f97ccf7ba2",
    "sourceExts": [
      "ts",
      "tsx",
      "mjs",
      "js",
      "jsx",
      "json",
      "cjs",
      "scss",
      "sass",
      "css"
    ],
    "assetExts": [
      "bmp",
      "gif",
      "jpg",
      "jpeg",
      "png",
      "psd",
      "svg",
      "webp",
      "xml",
      "m4v",
      "mov",
      "mp4",
      "mpeg",
      "mpg",
      "webm",
      "aac",
      "aiff",
      "caf",
      "m4a",
      "mp3",
      "wav",
      "html",
      "pdf",
      "yaml",
      "yml",
      "otf",
      "ttf",
      "zip",
      "heic",
      "avif",
      "db"
    ],
    "resolverMainFields": [
      "react-native",
      "browser",
      "main"
    ],
    "unstable_conditionNames": [],
    "unstable_conditionsByPlatform": {
      "ios": [
        "react-native"
      ],
      "android": [
        "react-native"
      ],
      "tvos": [
        "react-native"
      ],
      "macos": [
        "react-native"
      ],
      "web": [
        "browser"
      ]
    },
    "unstable_enablePackageExports": true,
    "platforms": [
      "ios",
      "android",
      "tvos",
      "macos"
    ]
  },
  "expo56": {
    "tool": "@expo/metro-config",
    "version": "56.0.19",
    "sourceHash": "b95ba4bb33756d89c8f038953554e788a23b5f461ee1c376ed8bae520f93f5ac",
    "outputHash": "9049627ae3cbea259d44c276b91d4a9cb36dedf9e25184c6b4f193f97ccf7ba2",
    "sourceExts": [
      "ts",
      "tsx",
      "mjs",
      "js",
      "jsx",
      "json",
      "cjs",
      "scss",
      "sass",
      "css"
    ],
    "assetExts": [
      "bmp",
      "gif",
      "jpg",
      "jpeg",
      "png",
      "psd",
      "svg",
      "webp",
      "xml",
      "m4v",
      "mov",
      "mp4",
      "mpeg",
      "mpg",
      "webm",
      "aac",
      "aiff",
      "caf",
      "m4a",
      "mp3",
      "wav",
      "html",
      "pdf",
      "yaml",
      "yml",
      "otf",
      "ttf",
      "zip",
      "heic",
      "avif",
      "db"
    ],
    "resolverMainFields": [
      "react-native",
      "browser",
      "main"
    ],
    "unstable_conditionNames": [],
    "unstable_conditionsByPlatform": {
      "ios": [
        "react-native"
      ],
      "android": [
        "react-native"
      ],
      "tvos": [
        "react-native"
      ],
      "macos": [
        "react-native"
      ],
      "web": [
        "browser"
      ]
    },
    "unstable_enablePackageExports": true,
    "platforms": [
      "ios",
      "android",
      "tvos",
      "macos"
    ]
  }
} as const;

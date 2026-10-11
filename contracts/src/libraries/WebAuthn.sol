// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title WebAuthn
/// @notice On-chain verification of WebAuthn (passkey) assertions using Monad's
///         native secp256r1/P-256 precompile at 0x0100 (EIP-7951).
///
/// @dev Why this library exists, and why "just call the precompile" is not enough:
///
///      The 0x0100 precompile verifies a raw ECDSA signature over a 32-byte hash.
///      It knows nothing about WebAuthn. Verifying only the raw signature would
///      accept a signature over ANY digest, which proves nothing about what the
///      human approved. WebAuthn's actually-signed payload is:
///
///          signedData   = authenticatorData || sha256(clientDataJSON)
///          digest       = sha256(signedData)
///
///      and a real platform authenticator signs `digest` directly. So this library
///      reconstructs the digest and additionally enforces the parts of the
///      WebAuthn spec that carry the *meaning* of the approval:
///
///        1. rpIdHash   == sha256(rpId)          - assertion came from our origin
///        2. flags UP|UV set                     - a human was present & verified
///        3. type       == "webauthn.get"        - it is an assertion, not a registration
///        4. challenge  == the action digest     - the human approved THIS action
///        5. origin     == expected origin       - anti-phishing
///        6. signature  valid over the digest    - authenticity
///
///      Checks 1-5 run before the (comparatively expensive) signature check.
///
///      Note on public keys: P-256 signatures do not support public key recovery.
///      The caller MUST therefore supply the public key from its own trusted store
///      (WitnessIntentRegistry holds the passkey enrolled by the human). Passing a
///      caller-supplied key here would let an attacker sign with their own key.
library WebAuthn {
    /// @dev Monad's P256 precompile. EIP-7951 supersedes RIP-7212; `0x100` and
    ///      `0x0100` are the same address and interface.
    address internal constant P256_PRECOMPILE = address(0x0100);

    /// @dev Input is exactly 160 bytes: hash(32) || r(32) || s(32) || qx(32) || qy(32).
    ///      Returns 32 bytes encoding uint256(1) on success, empty otherwise.
    uint256 internal constant P256_INPUT_LENGTH = 160;
    uint256 internal constant P256_GAS = 6900;

    /// @dev authenticatorData is at least rpIdHash(32) + flags(1) + signCount(4).
    uint256 internal constant MIN_AUTH_DATA_LENGTH = 37;

    /// @dev Authenticator data flag bits (WebAuthn L2 §6.1).
    uint8 internal constant FLAG_USER_PRESENT = 0x01;
    uint8 internal constant FLAG_USER_VERIFIED = 0x04;

    /// @notice A WebAuthn assertion. `qx`/`qy` are deliberately absent: the public
    ///         key must come from the relying party's own registration record.
    struct Assertion {
        bytes authenticatorData;
        bytes clientDataJSON;
        uint256 r;
        uint256 s;
    }

    /// @notice Distinct failure reasons, so callers can surface a real explanation
    ///         ("this expired") instead of a bare boolean.
    enum AuthError {
        None,
        RpIdMismatch,
        NoUserPresence,
        NoUserVerification,
        WrongType,
        ChallengeMismatch,
        OriginMismatch,
        BadSignature
    }

    /// @notice Verify an assertion against an expected challenge, a previously
    ///         enrolled passkey public key, and the expected RP identity.
    /// @param challenge The 32-byte digest the authenticator was asked to sign.
    ///        Callers pass the canonical action digest, which binds the approval
    ///        to the exact action, chain, and contract.
    /// @param a The assertion bytes supplied by the client.
    /// @param qx Enrolled passkey public key x-coordinate.
    /// @param qy Enrolled passkey public key y-coordinate.
    /// @param expectedRpId Relying party ID, e.g. "witness.example.com".
    /// @param expectedOrigin Full origin, e.g. "https://witness.example.com".
    /// @return AuthError.None when the assertion is valid and bound to `challenge`.
    function verify(
        bytes32 challenge,
        Assertion memory a,
        uint256 qx,
        uint256 qy,
        string memory expectedRpId,
        string memory expectedOrigin
    ) internal view returns (AuthError) {
        if (a.authenticatorData.length < MIN_AUTH_DATA_LENGTH) {
            return AuthError.RpIdMismatch;
        }

        // 1. The assertion must come from our relying party.
        if (_firstWord(a.authenticatorData) != sha256(bytes(expectedRpId))) {
            return AuthError.RpIdMismatch;
        }

        // 2. A human was present, and was actually verified (biometric/PIN).
        uint8 flags = uint8(a.authenticatorData[32]);
        if (flags & FLAG_USER_PRESENT == 0) return AuthError.NoUserPresence;
        if (flags & FLAG_USER_VERIFIED == 0) return AuthError.NoUserVerification;

        // 3. Assertions only. A registration ceremony must not authorize an action.
        (bytes memory type_, bool hasType) = _jsonString(a.clientDataJSON, "type");
        if (!hasType || keccak256(type_) != keccak256(bytes("webauthn.get"))) {
            return AuthError.WrongType;
        }

        // 4. The challenge must equal the action digest: this is what binds the
        //    human's tap to one specific action rather than "some approval".
        (bytes memory challengeValue, bool hasChallenge) =
            _jsonString(a.clientDataJSON, "challenge");
        if (!hasChallenge) return AuthError.ChallengeMismatch;
        if (keccak256(challengeValue) != keccak256(_base64UrlEncode(challenge))) {
            return AuthError.ChallengeMismatch;
        }

        // 5. Origin binding (anti-phishing; complements the rpIdHash check).
        (bytes memory origin_, bool hasOrigin) = _jsonString(a.clientDataJSON, "origin");
        if (!hasOrigin) return AuthError.OriginMismatch;
        if (keccak256(origin_) != keccak256(bytes(expectedOrigin))) {
            return AuthError.OriginMismatch;
        }

        // 6. Authenticity: verify the signature over the reconstructed digest.
        return _verifySignature(a, qx, qy);
    }

    /// @dev Reconstructs sha256(authenticatorData || sha256(clientDataJSON)) and
    ///      checks it against the P-256 precompile with the enrolled public key.
    function _verifySignature(Assertion memory a, uint256 qx, uint256 qy)
        private
        view
        returns (AuthError)
    {
        bytes32 clientDataHash = sha256(a.clientDataJSON);
        bytes32 digest = sha256(abi.encodePacked(a.authenticatorData, clientDataHash));

        (bool ok, bytes memory out) =
            P256_PRECOMPILE.staticcall(abi.encodePacked(digest, a.r, a.s, qx, qy));

        if (!ok || out.length != 32 || abi.decode(out, (uint256)) != 1) {
            return AuthError.BadSignature;
        }
        return AuthError.None;
    }

    /// @notice Reconstruct the digest a platform authenticator signs for an assertion.
    ///         Exposed so off-chain clients and tests can assert they sign the same bytes.
    function messageHash(bytes memory authenticatorData, bytes memory clientDataJSON)
        internal
        pure
        returns (bytes32)
    {
        return sha256(abi.encodePacked(authenticatorData, sha256(clientDataJSON)));
    }

    /// @notice base64url encoding WITHOUT padding, matching the WebAuthn spec's
    ///         encoding of `challenge` inside clientDataJSON.
    function _base64UrlEncode(bytes32 data) private pure returns (bytes memory) {
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        bytes memory input = new bytes(32);
        for (uint256 k = 0; k < 32; ++k) {
            input[k] = data[k];
        }

        // Unpadded length: (len * 4 + 2) / 3
        uint256 outLen = (input.length * 4 + 2) / 3;
        bytes memory out = new bytes(outLen);
        uint256 oi = 0;
        uint256 i = 0;

        for (; i + 3 <= input.length; i += 3) {
            uint24 n = (uint24(uint8(input[i])) << 16) | (uint24(uint8(input[i + 1])) << 8)
                | uint24(uint8(input[i + 2]));
            out[oi++] = table[(n >> 18) & 63];
            out[oi++] = table[(n >> 12) & 63];
            out[oi++] = table[(n >> 6) & 63];
            out[oi++] = table[n & 63];
        }

        uint256 rem = input.length - i;
        if (rem == 1) {
            uint24 n = uint24(uint8(input[i])) << 16;
            out[oi++] = table[(n >> 18) & 63];
            out[oi++] = table[(n >> 12) & 63];
        } else if (rem == 2) {
            uint24 n = (uint24(uint8(input[i])) << 16) | (uint24(uint8(input[i + 1])) << 8);
            out[oi++] = table[(n >> 18) & 63];
            out[oi++] = table[(n >> 12) & 63];
            out[oi++] = table[(n >> 6) & 63];
        }

        return out;
    }

    /// @notice Extract a top-level `"key":"value"` string from clientDataJSON.
    /// @dev clientDataJSON is produced by the browser and contains no escaped quotes
    ///      in the fields we read (type/challenge/origin), so scanning to the next
    ///      quote is sufficient — and far cheaper than a general JSON parser.
    function _jsonString(bytes memory json, string memory key)
        private
        pure
        returns (bytes memory value, bool found)
    {
        bytes memory prefix = bytes.concat(bytes('"'), bytes(key), bytes('":"'));
        int256 idx = _indexOf(json, prefix);
        if (idx < 0) return ("", false);

        uint256 start = uint256(idx) + prefix.length;
        uint256 end = start;
        while (end < json.length && json[end] != 0x22) {
            ++end;
        }
        if (end >= json.length || end == start) return ("", false);

        value = new bytes(end - start);
        for (uint256 i = 0; i < value.length; ++i) {
            value[i] = json[start + i];
        }
        return (value, true);
    }

    /// @notice Naive substring search. clientDataJSON is ~150-250 bytes in practice,
    ///         so the quadratic worst case is bounded and cheap.
    function _indexOf(bytes memory haystack, bytes memory needle) private pure returns (int256) {
        if (needle.length == 0 || haystack.length < needle.length) return -1;
        for (uint256 i = 0; i + needle.length <= haystack.length; ++i) {
            bool matched = true;
            for (uint256 j = 0; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return int256(i);
        }
        return -1;
    }

    /// @dev Read the first 32 bytes of a byte array as a word.
    function _firstWord(bytes memory b) private pure returns (bytes32 out) {
        assembly {
            out := mload(add(b, 32))
        }
    }
}

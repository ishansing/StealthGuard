package org.stealthguard.gateway.dto;

/** Fallback-challenge answer (SPEC §8.1). */
public record ChallengeResponseRequest(String challengeType, String response) {
}
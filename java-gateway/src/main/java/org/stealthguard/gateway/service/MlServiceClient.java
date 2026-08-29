package org.stealthguard.gateway.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

/**
 * Thin client for the Python ML service. Retries once with backoff, then the
 * circuit breaker trips; any failure surfaces as {@link MlUnavailableException}
 * so callers fail safe (ADR 0005).
 */
@Service
public class MlServiceClient {

    private static final Logger log = LoggerFactory.getLogger(MlServiceClient.class);

    private final String baseUrl;
    private final WebClient webClient;
    private final Duration timeout;

    public MlServiceClient(
        @Value("${stealthguard.ml-service-url}") String baseUrl,
        @Value("${stealthguard.ml-timeout:2s}") Duration timeout) {
        this.baseUrl = baseUrl;
        this.timeout = timeout;
        this.webClient = WebClient.builder().build();
    }

    public record FeatureResponse(
        Map<String, Double> features,
        @com.fasterxml.jackson.annotation.JsonProperty("shadow") ShadowDto shadow) {

        public record ShadowDto(
            @com.fasterxml.jackson.annotation.JsonProperty("score") double score,
            @com.fasterxml.jackson.annotation.JsonProperty("model_version") String modelVersion) {
        }
    }

    public record ScoreDto(
        @com.fasterxml.jackson.annotation.JsonProperty("humanness_score") double humannessScore,
        String label,
        @com.fasterxml.jackson.annotation.JsonProperty("model_version") String modelVersion,
        @com.fasterxml.jackson.annotation.JsonProperty("reason_codes") List<ReasonCodeDto> reasonCodes
    ) {

        public record ReasonCodeDto(String code, double weight) {
        }
    }

    @Retry(name = "mlService")
    @CircuitBreaker(name = "mlService")
    public FeatureResponse computeFeatures(Map<String, Object> rawTelemetry) {
        try {
            return webClient.post()
                .uri(baseUrl + "/features")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(rawTelemetry)
                .retrieve()
                .bodyToMono(FeatureResponse.class)
                .block(timeout);
        } catch (RuntimeException e) {
            log.warn("ML /features failed: {}", e.getMessage());
            throw new MlUnavailableException("feature computation failed", e);
        }
    }

    @Retry(name = "mlService")
    @CircuitBreaker(name = "mlService")
    public ScoreDto score(String sessionId, Map<String, Double> features) {
        try {
            return webClient.post()
                .uri(baseUrl + "/score")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(Map.of("session_id", sessionId, "features", features))
                .retrieve()
                .bodyToMono(ScoreDto.class)
                .block(timeout);
        } catch (RuntimeException e) {
            log.warn("ML /score failed: {}", e.getMessage());
            throw new MlUnavailableException("scoring failed", e);
        }
    }
}
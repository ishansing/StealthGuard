package org.stealthguard.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.stealthguard.gateway.model.Decision;
import org.stealthguard.gateway.repository.DecisionRepository;

/**
 * Phase 9 B1 — shadow trial mode: the caller always sees `allow` while the
 * real (would-have-been) decision is persisted with trial_mode=true.
 */
@AutoConfigureMockMvc
class TrialModeTest extends AbstractPostgresTest {

    static WireMockServer wireMock = new WireMockServer(options().dynamicPort());

    static {
        wireMock.start();
    }

    @DynamicPropertySource
    static void trialProps(DynamicPropertyRegistry registry) {
        registry.add("stealthguard.ml-service-url", wireMock::baseUrl);
        registry.add("stealthguard.trial-mode", () -> "true");
    }

    @BeforeEach
    void resetMlStub() {
        wireMock.resetAll();
        wireMock.stubFor(WireMock.post(urlEqualTo("/features")).willReturn(aResponse()
            .withHeader("Content-Type", "application/json")
            .withStatus(200)
            .withBody("{\"features\":{\"event_count\":3.0}}")));
        // Bot-like score -> the real decision is block.
        wireMock.stubFor(WireMock.post(urlEqualTo("/score")).willReturn(aResponse()
            .withHeader("Content-Type", "application/json")
            .withStatus(200)
            .withBody("{\"humanness_score\":0.1,\"label\":\"bot\",\"model_version\":\"rule-based\",\"reason_codes\":[]}")));
    }

    @AfterAll
    static void stopMlStub() {
        wireMock.stop();
    }

    @Autowired
    MockMvc mockMvc;

    @Autowired
    DecisionRepository decisionRepository;

    @Test
    void trialModeReturnsAllowToCallerButPersistsRealDecision() throws Exception {
        var init = mockMvc.perform(post("/stealthguard/session/init")
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isOk()).andReturn();
        String sessionId = new com.fasterxml.jackson.databind.ObjectMapper()
            .readTree(init.getResponse().getContentAsString()).get("session_id").asText();

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"session_id\":\"%s\",\"keystrokes\":[{\"key\":\"a\",\"down_time\":1.0,\"up_time\":1.1}]}"
                    .formatted(sessionId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("allow"));

        Decision persisted = decisionRepository
            .findTopBySessionIdOrderByCreatedAtDesc(java.util.UUID.fromString(sessionId)).orElseThrow();
        assertThat(persisted.getDecision()).isEqualTo("block");
        assertThat(persisted.isTrialMode()).isTrue();
        assertThat(persisted.getLatencyMs()).isNotNull();
    }
}
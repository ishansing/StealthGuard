package org.stealthguard.gateway;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.MvcResult;
import org.stealthguard.gateway.repository.DecisionRepository;
import org.stealthguard.gateway.repository.ScoreRepository;
import org.stealthguard.gateway.repository.SessionRepository;
import org.stealthguard.gateway.repository.TelemetryEventRepository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

/** Full-path test: real Postgres (Flyway-migrated) + WireMock stubbing the ML service. */
@AutoConfigureMockMvc
class TelemetryIntegrationTest extends AbstractPostgresTest {

    static WireMockServer wireMock = new WireMockServer(options().dynamicPort());

    static {
        wireMock.start();
    }

    @BeforeEach
    void resetMlStub() {
        if (!wireMock.isRunning()) {
            wireMock.start();
        }
        wireMock.resetAll();
        wireMock.stubFor(WireMock.post(urlEqualTo("/features")).willReturn(aResponse()
            .withHeader("Content-Type", "application/json")
            .withStatus(200)
            .withBody("{\"features\":{\"event_count\":2.0}}")));
        stubScore(0.9, "human");
    }

    @AfterAll
    static void stopMlStub() {
        wireMock.stop();
    }

    @DynamicPropertySource
    static void mlProps(DynamicPropertyRegistry registry) {
        registry.add("stealthguard.ml-service-url", wireMock::baseUrl);
    }

    @Autowired
    MockMvc mockMvc;

    @Autowired
    SessionRepository sessionRepository;

    @Autowired
    TelemetryEventRepository eventRepository;

    @Autowired
    ScoreRepository scoreRepository;

    @Autowired
    DecisionRepository decisionRepository;

    @Autowired
    ObjectMapper objectMapper;

    @Test
    void fullPathPersistsEventsScoreAndDecision() throws Exception {
        MvcResult init = mockMvc.perform(post("/stealthguard/session/init")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"page\":\"/login\"}"))
            .andExpect(status().isOk())
            .andReturn();
        String sessionId = objectMapper.readTree(init.getResponse().getContentAsString())
            .get("session_id").asText();

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "session_id": "%s",
                      "page": "/login",
                      "keystrokes": [{"key":"a","down_time":1.0,"up_time":1.2}],
                      "mouse_moves": [{"x":1.0,"y":2.0,"t":3.0}],
                      "meta": {"user_agent":"test","viewport_width":1366,"viewport_height":768,
                               "timezone_offset":330,"input_modality":"mouse"}
                    }
                    """.formatted(sessionId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("allow"));

        var session = sessionRepository.findById(java.util.UUID.fromString(sessionId)).orElseThrow();
        assertThat(session.getUserAgent()).isEqualTo("test");
        assertThat(eventRepository.countBySessionId(session.getId())).isEqualTo(2);
        assertThat(scoreRepository.countBySessionId(session.getId())).isEqualTo(1);
        assertThat(decisionRepository.countBySessionId(session.getId())).isEqualTo(1);
    }

    @Test
    void piiShapedFieldsRejectedBeforePersistence() throws Exception {
        MvcResult init = mockMvc.perform(post("/stealthguard/session/init")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andReturn();
        String sessionId = objectMapper.readTree(init.getResponse().getContentAsString())
            .get("session_id").asText();

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {"session_id":"%s","keystrokes":[{"key":"a","email":"x@y.z","down_time":1.0,"up_time":1.1}]}
                    """.formatted(sessionId)))
            .andExpect(status().isUnprocessableEntity());

        assertThat(eventRepository.countBySessionId(java.util.UUID.fromString(sessionId))).isZero();
    }

    @Test
    void mlFailureFailsSafeToChallenge() throws Exception {
        stubScore500();

        MvcResult init = mockMvc.perform(post("/stealthguard/session/init")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
            .andExpect(status().isOk())
            .andReturn();
        String sessionId = objectMapper.readTree(init.getResponse().getContentAsString())
            .get("session_id").asText();

        mockMvc.perform(post("/stealthguard/telemetry")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"session_id\":\"%s\",\"keystrokes\":[{\"key\":\"a\",\"down_time\":1.0,\"up_time\":1.1}]}"
                    .formatted(sessionId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("challenge"));

        mockMvc.perform(get("/stealthguard/decision/{id}", sessionId))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.decision").value("challenge"));

        org.stealthguard.gateway.model.Decision decision =
            decisionRepository.findTopBySessionIdOrderByCreatedAtDesc(
                java.util.UUID.fromString(sessionId)).orElseThrow();
        assertThat(decision.getDecision()).isEqualTo("challenge");
        assertThat(decision.getReason()).isEqualTo("ml-service unavailable");
    }

    private static void stubScore(double score, String label) {
        wireMock.stubFor(WireMock.post(urlEqualTo("/score")).willReturn(aResponse()
            .withHeader("Content-Type", "application/json")
            .withStatus(200)
            .withBody("""
                {"session_id":"x","humanness_score":%s,"label":"%s","model_version":"rule-based",
                 "reason_codes":[],"debug":{"threshold_human":0.8,"threshold_bot":0.4}}
                """.formatted(score, label))));
    }

    private static void stubScore500() {
        wireMock.stubFor(WireMock.post(urlEqualTo("/score")).willReturn(aResponse().withStatus(500)));
    }
}
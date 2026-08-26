package org.stealthguard.gateway;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base class for tests that need a real Postgres. The container is started once
 * per JVM (static block) and shared by every test class — Spring reuses cached
 * contexts, so the datasource URL must stay stable. Ryuk removes the container
 * on JVM exit.
 */
@SpringBootTest
abstract class AbstractPostgresTest {

    static final PostgreSQLContainer<?> POSTGRES;

    static {
        POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("stealthguard")
            .withUsername("stealthguard")
            .withPassword("stealthguard_dev");
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
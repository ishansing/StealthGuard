package org.stealthguard.gateway.repository;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.TelemetryEvent;

public interface TelemetryEventRepository extends JpaRepository<TelemetryEvent, Long> {

    long countBySessionId(UUID sessionId);

    List<TelemetryEvent> findBySessionIdOrderByTimestampAsc(UUID sessionId);
}

package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.TelemetryEvent;

public interface TelemetryEventRepository extends JpaRepository<TelemetryEvent, Long> {
}

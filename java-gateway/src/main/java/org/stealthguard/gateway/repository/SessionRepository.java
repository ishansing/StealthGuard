package org.stealthguard.gateway.repository;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.Session;

public interface SessionRepository extends JpaRepository<Session, UUID> {
}
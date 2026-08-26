package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.Decision;

public interface DecisionRepository extends JpaRepository<Decision, Long> {
}

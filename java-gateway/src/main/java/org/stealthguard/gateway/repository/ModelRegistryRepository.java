package org.stealthguard.gateway.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.stealthguard.gateway.model.ModelRegistry;

public interface ModelRegistryRepository extends JpaRepository<ModelRegistry, String> {
}
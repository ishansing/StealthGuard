package org.stealthguard.gateway.model;

import java.time.Instant;
import java.util.Map;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "model_registry")
@Getter
@Setter
@NoArgsConstructor
public class ModelRegistry {

    @Id
    private String version;

    @Column(name = "trained_at", nullable = false)
    private Instant trainedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metrics_json")
    private Map<String, Object> metricsJson;

    @Column(name = "is_active", nullable = false)
    private boolean isActive;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "feature_list")
    private Map<String, Object> featureList;
}
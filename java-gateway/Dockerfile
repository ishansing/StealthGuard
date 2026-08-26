# Single-stage: the maven image doubles as the runtime so `make test`
# (`docker compose run java_gateway ./mvnw test`) works from the same image.
FROM maven:3.9-eclipse-temurin-21
WORKDIR /app

# Healthcheck dependency
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY mvnw mvnw.cmd ./
COPY .mvn .mvn
COPY pom.xml checkstyle.xml ./
RUN ./mvnw -B -q dependency:go-offline || true

COPY src src
RUN ./mvnw -B -q -DskipTests package

EXPOSE 8080
CMD ["sh", "-c", "java -jar target/java-gateway-0.1.0-SNAPSHOT.jar"]
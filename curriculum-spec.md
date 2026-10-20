# Curriculum Specification (v2, references validated)

## 0. Source status

| Source | Status |
|---|---|
| roadmap.sh/java | **Validated** from the owner-supplied screenshot. 80 nodes; frozen in `data/curriculum/roadmap-sh-nodes.json`. No node may be added, removed or renamed without an owner-approved diff. |
| Sagar Java Roadmap | **Validated** from supplied source: 4 phases, 28 topics, weeks, tags, quiz, resources, habits, progress logic. Captured as traceability data in `data/baseline/sagar-baseline.json`. |

Changes from v1: (1) the diagram contains **Javadoc** under a Documentation hub, which the project brief omitted, so the node count is **80, not 79**; (2) labels follow the diagram ("Spring (Spring Boot)", "volatile keyword"); (3) Testing has four named boxes; (4) Sagar's four phase names and week ranges are the phase structure, except that Concurrency now sits in phase 3 (owner decision D1, ADR-0006); (5) milestones are re-cut to be balanced inside those phases.

Layers, kept strictly separate (ADR-0004):
1. **Curriculum** = roadmap.sh nodes (authority).
2. **Editorial layer** = phases, 28 milestones, weeks, prerequisites (ours).
3. **Baseline** = Sagar's 28 topics and features, mapped onto layers 1-2 (traceability only).
4. **Content** = our teaching material per topic.

## 1. roadmap.sh hierarchy (80 nodes, 12 groups)

Hubs/boxes as drawn. Per-node nested subjects are not visible on the diagram; they come from each node's detail panel and are captured during content authoring, never invented.

### Learn the Basics (11)
- Basic Syntax; Lifecycle of a Program; Data Types; Variables and Scopes; Type Casting; Math Operations; Conditionals; Loops; Strings and Methods; Arrays; Basics of OOP

### Object Oriented Programming (27)
- **Basics of OOP** box: Classes and Objects; Attributes and Methods; Static Keyword; Final Keyword; Access Specifiers; Packages; Nested Classes
- **More about OOP** box: Method Chaining; Object Lifecycle; Initializer Block; Pass by Value / Pass by Reference; Encapsulation; Inheritance; Method Overloading / Overriding; Static vs Dynamic Binding; Abstraction; Interfaces; Enums; Record
- Exception Handling; I/O Operations; File Operations; Annotations; Modules; Lambda Expressions; Optionals; Dependency Injection

### Collections (8)
- Array vs ArrayList; Queue; Dequeue; Stack; Set; Map; Iterator; Generic Collections

### Concurrency (4)
- Threads; Virtual Threads; Java Memory Model; volatile keyword

### Advanced Java (label from project brief; unlabeled cluster on diagram) (4)
- Regular Expressions; Networking; Date and Time; Cryptography

### Functional Programming (4)
- Functional Interfaces; High Order Functions; Functional Composition; Stream API

### Build Tools (3)
- Maven; Gradle; Bazel

### Web Frameworks (4)
- Spring (Spring Boot); Quarkus; Javalin; Play Framework

### Database Access (4)
- JDBC; Hibernate; EBean; Spring Data JPA

### Documentation (1)
- Javadoc

### Logging Frameworks (4)
- SLF4J; Logback; Log4j2; TinyLog

### Testing (6)
- **Unit Testing** box: JUnit; TestNG
- **Mocking** box: Mockito
- **Integration Testing** box: REST Assured; JMeter
- **Behavior Testing** box: Cucumber-JVM

Diagram notes: the Web Frameworks hub is annotated "Spring Boot is recommended"; the diagram links out to the Backend roadmap and states that this roadmap intentionally skips some backend topics (Java-specific scope, preserved).

## 2. Four phases (Sagar structure kept)

| Phase | Name (Sagar name, except phase 3) | Weeks | Milestones | Topics |
|---|---|---|---|---|
| 1 | Java Basics | 1-2 | 6 | 11 |
| 2 | Object-Oriented Programming | 3-5 | 7 | 19 |
| 3 | Core Java & Concurrency | 6-8 | 8 | 21 |
| 4 | Modern Java & Beyond | 9-12 | 7 | 29 |

Phase 3 was renamed to reflect Concurrency; Sagar's other names are kept. Placement differences from Sagar are recorded in section 4.

## 3. 28 milestones (editorial)

Every topic belongs to exactly one milestone. Milestones are the unit of weekly planning and mini-checks. Milestones per phase are 6 / 7 / 8 / 7. Phase 3 is Core Java + Concurrency; phase 4 is functional Java plus the professional ecosystem.

| # | Phase | Milestone | Topics | Min |
|---|---|---|---|---|
| M01 | 1 | Setup and Program Anatomy | Basic Syntax; Lifecycle of a Program | 90 |
| M02 | 1 | Variables and Data Types | Data Types; Variables and Scopes; Type Casting | 145 |
| M03 | 1 | Operators and Expressions | Math Operations | 60 |
| M04 | 1 | Control Flow | Conditionals; Loops | 105 |
| M05 | 1 | Strings and Methods | Strings and Methods | 90 |
| M06 | 1 | Arrays and the Bridge to OOP | Arrays; Basics of OOP | 105 |
| M07 | 2 | Classes and Objects | Classes and Objects; Attributes and Methods; Static Keyword; Method Chaining | 240 |
| M08 | 2 | Constructors and Object Lifecycle | Object Lifecycle; Initializer Block; Final Keyword; Pass by Value / Pass by Reference | 190 |
| M09 | 2 | Encapsulation and Code Structure | Access Specifiers; Encapsulation; Packages; Nested Classes | 210 |
| M10 | 2 | Inheritance | Inheritance | 90 |
| M11 | 2 | Polymorphism | Method Overloading / Overriding; Static vs Dynamic Binding | 125 |
| M12 | 2 | Abstraction and Interfaces | Abstraction; Interfaces | 150 |
| M13 | 2 | Enums and Records | Enums; Record | 100 |
| M14 | 3 | Text Patterns | Regular Expressions | 75 |
| M15 | 3 | Lists, Queues and Stacks | Array vs ArrayList; Queue; Dequeue; Stack | 180 |
| M16 | 3 | Sets, Maps and Iteration | Set; Map; Iterator | 170 |
| M17 | 3 | Exception Handling | Exception Handling | 90 |
| M18 | 3 | File I/O and Networking | I/O Operations; File Operations; Networking | 220 |
| M19 | 3 | Generics, Annotations and Modules | Generic Collections; Annotations; Modules | 205 |
| M20 | 3 | Dates and Security | Date and Time; Cryptography | 150 |
| M21 | 3 | Concurrency | Threads; Virtual Threads; Java Memory Model; volatile keyword | 265 |
| M22 | 4 | Functional Java | Lambda Expressions; Functional Interfaces; High Order Functions; Functional Composition; Optionals | 305 |
| M23 | 4 | Streams | Stream API | 110 |
| M24 | 4 | Build Tools and Documentation | Maven; Gradle; Bazel; Javadoc | 225 |
| M25 | 4 | Dependency Injection and Web Frameworks | Dependency Injection; Spring (Spring Boot); Quarkus; Javalin; Play Framework | 330 |
| M26 | 4 | Database Access | JDBC; Hibernate; EBean; Spring Data JPA | 310 |
| M27 | 4 | Testing | JUnit; TestNG; Mockito; REST Assured; JMeter; Cucumber-JVM | 335 |
| M28 | 4 | Logging | SLF4J; Logback; Log4j2; TinyLog | 185 |

## 4. Sagar baseline traceability (all 28 covered)

Sagar's 28 topics are a UX layer; each maps onto our milestones and roadmap.sh topics. Sagar's descriptions are not reproduced.

| # | Sagar topic | Tag | Sagar phase | Our milestone | Our roadmap.sh topics | Supporting / note |
|---|---|---|---|---|---|---|
| 1 | Install JDK & IntelliJ IDEA | easy | 1 | M01 | Lifecycle of a Program | JDK install and IDE setup guide |
| 2 | Variables & Data Types | easy | 1 | M02 | Data Types; Variables and Scopes |  |
| 3 | Operators & Expressions | easy | 1 | M03 | Math Operations | relational, logical and assignment operators |
| 4 | Conditionals (if/else, switch) | easy | 1 | M04 | Conditionals |  |
| 5 | Loops (for, while, do-while) | easy | 1 | M04 | Loops |  |
| 6 | Methods & Parameters | easy | 1 | M05 | Strings and Methods; Attributes and Methods | methods, parameters, return values, overloading intro |
| 7 | Arrays | easy | 1 | M06 | Arrays |  |
| 8 | Classes & Objects | medium | 2 | M07 | Classes and Objects |  |
| 9 | Constructors & this keyword | medium | 2 | M08 | Object Lifecycle | constructor chaining and this |
| 10 | Encapsulation | medium | 2 | M09 | Encapsulation; Access Specifiers |  |
| 11 | Inheritance & extends | medium | 2 | M10 | Inheritance |  |
| 12 | Polymorphism | medium | 2 | M11 | Method Overloading / Overriding; Static vs Dynamic Binding | upcasting and downcasting |
| 13 | Interfaces & Abstract Classes | hard | 2 | M12 | Abstraction; Interfaces |  |
| 14 | Enums | medium | 2 | M13 | Enums |  |
| 15 | Strings & StringBuilder | medium | 3 | M05 | Strings and Methods | StringBuilder and immutability; Sagar places this in phase 3; we teach it in phase 1 because strings are needed from the first programs |
| 16 | ArrayList & LinkedList | medium | 3 | M15 | Array vs ArrayList | LinkedList performance trade-offs |
| 17 | HashMap & HashSet | medium | 3 | M16 | Map; Set | hashing and collisions |
| 18 | Exception Handling | medium | 3 | M17 | Exception Handling |  |
| 19 | File I/O basics | hard | 3 | M18 | I/O Operations; File Operations |  |
| 20 | Generics | hard | 3 | M19 | Generic Collections |  |
| 21 | Comparable & Comparator | hard | 3 | M19 | Generic Collections | natural and custom ordering |
| 22 | Lambda Expressions | hard | 4 | M21 | Lambda Expressions |  |
| 23 | Streams API | hard | 4 | M22 | Stream API |  |
| 24 | Optional<T> | hard | 4 | M21 | Optionals |  |
| 25 | Multithreading Basics | hard | 4 | M21 | Threads | Sagar places this in phase 4; owner decision D1 moves Concurrency into our phase 3 |
| 26 | Build a Project | hard | 4 | Projects feature | none (not a roadmap.sh node) | capstone projects delivered by the Projects feature (Prompt 7) |
| 27 | Intro to Spring Boot | hard | 4 | M25 | Spring (Spring Boot) |  |
| 28 | Unit Testing with JUnit | hard | 4 | M27 | JUnit |  |

Gaps to fill with *supporting* content (labelled, never roadmap nodes): JDK/IDE setup, operators, methods and parameters, StringBuilder, Comparable/Comparator, upcasting/downcasting, SQL basics for JDBC.

## 5. 12-week baseline plan

Weeks per phase are Sagar's (1-2, 3-5, 6-8, 9-12). The shipped plan is **generated** from milestones, `estimatedMinutes` and prerequisites; this table is the baseline shape.

| Week | Phase | Milestones | Topics | Minutes |
|---|---|---|---|---|
| 1 | 1 | M01, M02, M03 | 6 | 295 |
| 2 | 1 | M04, M05, M06 | 5 | 300 |
| 3 | 2 | M07, M08 | 8 | 430 |
| 4 | 2 | M09, M10 | 5 | 300 |
| 5 | 2 | M11, M12, M13 | 6 | 375 |
| 6 | 3 | M14, M15, M16 | 8 | 425 |
| 7 | 3 | M17, M18, M19 | 7 | 515 |
| 8 | 3 | M20, M21 | 6 | 415 |
| 9 | 4 | M22, M23 | 6 | 415 |
| 10 | 4 | M24, M25 | 9 | 555 |
| 11 | 4 | M26 | 4 | 310 |
| 12 | 4 | M27, M28 | 10 | 520 |

Load: weekly minutes range 295-555. Weeks 6-8 and 9-12 each average about 450. Week 11 (310 min, Database Access) intentionally leaves room to start a capstone project. `depth: survey` topics stay short.

## 6. Dependencies

- `prerequisites` = hard edges (drive "recommended next"); `relatedTopics` = soft edges (navigation only). Both live on the topic, in `topics.json`.
- Learning order is the array order (`order`). A prerequisite must have a lower order, which makes cycles impossible; the validator enforces it, plus unknown/self/duplicate references.
- Milestones cannot go backwards in phase order, and every milestone has at least one topic.
- Edges are editorial. Full per-topic list: `roadmap-content-map.md`.
- Spine examples: Basic Syntax → Data Types → Variables and Scopes → Type Casting → Math Operations → Conditionals → Loops → Arrays; Classes and Objects → Access Specifiers → Inheritance → Method Overloading / Overriding → Abstraction → Interfaces; Interfaces + Map → Generic Collections → Stream API; JDBC → Hibernate → Spring Data JPA (+ Spring Boot).

## 7. Supporting-material policy

Java-specific scope only. A supporting concept appears as a clearly marked "Supporting" section inside a topic (`TopicContent.supporting`), never as a roadmap node, milestone or progress item.

## 8. Required topic content and status

Per `product-spec.md` section 5. Each topic carries `contentStatus` (`outline` | `authored` | `reviewed`). Structure (title, description, objectives, difficulty, minutes, prerequisites, related) is real now; examples, exercises, quizzes, resources, subtopics are filled during Prompts 5-6. The release gate (`--release`) fails while any topic is still `outline`. A topic is never shown as complete content while `outline`.

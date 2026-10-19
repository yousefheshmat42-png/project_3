# Three student backend portfolio projects

Three independent, small JavaScript / Node.js 24 / SQLite APIs. No third-party packages, API keys from external services or paid services are required. Each folder can be used as a separate repository.

| Folder | Project | Demonstrates | Port |
|---|---|---|---|
| 01-task-manager-api | Task Manager API | CRUD, user authentication, record ownership, filtering and pagination. | 3001 |
| 02-store-orders-api | Store Orders API | Relational data, admin authorization, checkout rules, SQL transactions and inventory consistency. | 3002 |
| 03-appointment-booking-api | Appointment Booking API | Time validation, conflict detection, database uniqueness constraints, authorization and transactional booking. | 3003 |

## Start here

Install Node.js 24.x, extract the bundle, open a terminal inside one project folder and run:

```sh
npm run demo
npm test
npm start
```

No npm install is needed. Stop the server with Ctrl+C. Read each README for API endpoints, optional .env setup, manual requests and HTTP-mode tests. Persistent databases are created only when using npm start; tests and demos are isolated.

For the store and booking APIs, set your own ADMIN_KEY in .env before using administrative endpoints. The automated demos generate a temporary key themselves.

## Included

- Complete, editable source code for all three backends.
- English setup/API documentation and Arabic portfolio descriptions.
- Example requests, repeatable demos and integration tests.
- MOSTAQL_AR.md with a presentation outline for each project.
- VERIFICATION.md explaining checks and execution limits.

These are student learning projects, not commercial production systems. They include no frontend and no deployment. Customize them and explain your actual contribution when adding them to a portfolio.


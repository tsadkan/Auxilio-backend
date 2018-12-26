# Auxilio API

## Development

\$ npm run dev

## Production

\$ npm run start

# NOTE

0 - At which port does it listen on?

- Web server listens at : http://localhost:3000

- API explorer listens at : http://localhost:3000/explorer

1 - The following environment variables are required.

ELASTICSEARCH_HOST
ES_INDEX
MONGO_PRODUCTION_URI
RESET_PASSWORD_URL
ADMIN_EMAIL
ADMIN_PASS

Make sure you define them before starting the API. .env files are supported.
Example:

```
ELASTICSEARCH_HOST ="http://localhost:9200"
ES_INDEX ="auxilio.*"
MONGO_PRODUCTION_URI="mongodb://localhost"
RESET_PASSWORD_URL="http://test.com/reset"
ADMIN_EMAIL="test@test.com"
ADMIN_PASS="test"

```

2 - define seed users in a file _server/boot/seed-users.json_ using a schema like the example below

```
{
    "adminUsers": [
        { "fullName": "admin", "email": "admin@ahadoo.com", "password": "admin" },
    ],
    "memberUsers": [
        { "fullName": "testa", "email": "testa@ahadoo.com", "password": "testa" }
    ]
}


```

#Note
- on Post/list endpoint the filter should be send using the following format/assuming it only accepts where filter - {"categoryId": "--", "createdById": "--"}
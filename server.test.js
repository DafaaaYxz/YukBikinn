const request = require('supertest');
const server = require('./server'); // Import the server

describe('Routing Tests', () => {
    let testServer;

    beforeAll((done) => {
        // Start the server on a random available port
        testServer = server.listen(0, done);
    });

    afterAll((done) => {
        // Close the server after all tests are done
        testServer.close(done);
    });

    it('should serve index.html for the root URL', async () => {
        const res = await request(testServer).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        expect(res.text).toContain('Create AI Bot');
    });

    it('should serve index.html for a /bot/:botId URL, allowing the client-side router to take over', async () => {
        const res = await request(testServer).get('/bot/some-bot-id');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        expect(res.text).toContain('Create AI Bot'); // The main shell should be served
    });

    it('should return 404 for an unknown API route', async () => {
        const res = await request(testServer).get('/api/unknown');
        expect(res.status).toBe(404);
    });
});

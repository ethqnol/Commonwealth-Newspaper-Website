/**
 * Firestore Security Rules Tests
 *
 * Uses @firebase/rules-unit-testing against the local Firebase emulator.
 * Run the emulator first:
 *   npx firebase emulators:start --only firestore
 *
 * Then run:
 *   npm test -- --testPathPattern=firestore
 *
 * These tests verify that:
 *  - Public/anyone can read published articles and email whitelists (needed for login flow)
 *  - Non-admins CANNOT write to articles, whitelistedEmails, or adminEmails
 *  - Admins CAN write to all collections
 *  - Users can read/write their own user document
 *  - Users CANNOT read other users' documents (unless admin)
 */

import {
    initializeTestEnvironment,
    RulesTestEnvironment,
    assertSucceeds,
    assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
    doc,
    getDoc,
    setDoc,
    collection,
    getDocs,
} from 'firebase/firestore';

const PROJECT_ID = 'cws-newspaper-test';
const RULES_PATH = resolve(__dirname, '../firestore.rules');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: readFileSync(RULES_PATH, 'utf8'),
            host: '127.0.0.1',
            port: 8080,
        },
    });
});

afterAll(async () => {
    await testEnv.cleanup();
});

afterEach(async () => {
    await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Admin user context: has uid 'admin-uid' and role ADMIN in Firestore */
async function seedAdminUser() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'admin-uid'), {
            email: 'admin@commschool.org',
            name: 'Admin User',
            role: 'ADMIN',
            createdAt: new Date(),
        });
    });
}

/** Regular (non-admin) user context */
async function seedRegularUser() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'user-uid'), {
            email: 'student@commschool.org',
            name: 'Regular Student',
            role: 'USER',
            createdAt: new Date(),
        });
    });
}

/** Seed a test article */
async function seedArticle(id = 'test-article-1') {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'articles', id), {
            title: 'Test Article',
            content: 'Body text.',
            author: 'Staff Writer',
            slug: 'test-article',
            period: 'Spring 2026',
            isPublished: true,
            isArchived: false,
            type: 'STORY',
            createdAt: new Date(),
        });
    });
}

// ---------------------------------------------------------------------------
// articles collection
// ---------------------------------------------------------------------------
describe('articles', () => {
    it('unauthenticated user CAN read a published article', async () => {
        await seedArticle();
        const unauth = testEnv.unauthenticatedContext();
        await assertSucceeds(getDoc(doc(unauth.firestore(), 'articles', 'test-article-1')));
    });

    it('unauthenticated user CANNOT write an article', async () => {
        const unauth = testEnv.unauthenticatedContext();
        await assertFails(
            setDoc(doc(unauth.firestore(), 'articles', 'new-article'), {
                title: 'Hack',
                isPublished: true,
            })
        );
    });

    it('regular authenticated user CANNOT write an article', async () => {
        await seedRegularUser();
        const user = testEnv.authenticatedContext('user-uid');
        await assertFails(
            setDoc(doc(user.firestore(), 'articles', 'rogue-article'), {
                title: 'Rogue post',
                isPublished: true,
            })
        );
    });

    it('admin user CAN write an article', async () => {
        await seedAdminUser();
        const admin = testEnv.authenticatedContext('admin-uid');
        await assertSucceeds(
            setDoc(doc(admin.firestore(), 'articles', 'legit-article'), {
                title: 'Legit article',
                content: 'Body.',
                author: 'Editor',
                slug: 'legit-article',
                period: 'Spring 2026',
                isPublished: false,
                type: 'STORY',
                createdAt: new Date(),
            })
        );
    });
});

// ---------------------------------------------------------------------------
// users collection
// ---------------------------------------------------------------------------
describe('users', () => {
    it('user CAN read their own document', async () => {
        await seedRegularUser();
        const user = testEnv.authenticatedContext('user-uid');
        await assertSucceeds(getDoc(doc(user.firestore(), 'users', 'user-uid')));
    });

    it('user CAN write their own document', async () => {
        const user = testEnv.authenticatedContext('user-uid');
        await assertSucceeds(
            setDoc(doc(user.firestore(), 'users', 'user-uid'), {
                email: 'student@commschool.org',
                name: 'Regular Student',
                role: 'USER',
                createdAt: new Date(),
            })
        );
    });

    it('user CANNOT read another user\'s document', async () => {
        await seedAdminUser(); // ensure admin-uid doc exists
        const user = testEnv.authenticatedContext('user-uid');
        // user-uid trying to read admin-uid's doc
        await assertFails(getDoc(doc(user.firestore(), 'users', 'admin-uid')));
    });

    it('unauthenticated user CANNOT read any user document', async () => {
        await seedRegularUser();
        const unauth = testEnv.unauthenticatedContext();
        await assertFails(getDoc(doc(unauth.firestore(), 'users', 'user-uid')));
    });

    it('admin CAN read any user document', async () => {
        await seedAdminUser();
        await seedRegularUser();
        const admin = testEnv.authenticatedContext('admin-uid');
        await assertSucceeds(getDoc(doc(admin.firestore(), 'users', 'user-uid')));
    });
});

// ---------------------------------------------------------------------------
// whitelistedEmails collection
// ---------------------------------------------------------------------------
describe('whitelistedEmails', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'whitelistedEmails', 'e1'), {
                email: 'external@example.com',
            });
        });
    });

    it('unauthenticated user CAN read (needed for login flow)', async () => {
        const unauth = testEnv.unauthenticatedContext();
        await assertSucceeds(getDocs(collection(unauth.firestore(), 'whitelistedEmails')));
    });

    it('regular user CANNOT write to whitelistedEmails', async () => {
        await seedRegularUser();
        const user = testEnv.authenticatedContext('user-uid');
        await assertFails(
            setDoc(doc(user.firestore(), 'whitelistedEmails', 'e2'), { email: 'evil@example.com' })
        );
    });

    it('admin CAN add to whitelistedEmails', async () => {
        await seedAdminUser();
        const admin = testEnv.authenticatedContext('admin-uid');
        await assertSucceeds(
            setDoc(doc(admin.firestore(), 'whitelistedEmails', 'e3'), { email: 'trusted@example.com' })
        );
    });
});

// ---------------------------------------------------------------------------
// adminEmails collection
// ---------------------------------------------------------------------------
describe('adminEmails', () => {
    beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), 'adminEmails', 'a1'), {
                email: 'admin@commschool.org',
            });
        });
    });

    it('unauthenticated user CAN read adminEmails (needed for login flow)', async () => {
        const unauth = testEnv.unauthenticatedContext();
        await assertSucceeds(getDocs(collection(unauth.firestore(), 'adminEmails')));
    });

    it('regular user CANNOT write to adminEmails', async () => {
        await seedRegularUser();
        const user = testEnv.authenticatedContext('user-uid');
        await assertFails(
            setDoc(doc(user.firestore(), 'adminEmails', 'a2'), { email: 'self@example.com' })
        );
    });

    it('unauthenticated user CANNOT write to adminEmails', async () => {
        const unauth = testEnv.unauthenticatedContext();
        await assertFails(
            setDoc(doc(unauth.firestore(), 'adminEmails', 'a3'), { email: 'hacker@example.com' })
        );
    });

    it('admin CAN write to adminEmails', async () => {
        await seedAdminUser();
        const admin = testEnv.authenticatedContext('admin-uid');
        await assertSucceeds(
            setDoc(doc(admin.firestore(), 'adminEmails', 'a4'), { email: 'new-admin@commschool.org' })
        );
    });
});

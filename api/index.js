const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const { kv } = require('@vercel/kv');
const path = require('path');

const app = express();

// Middleware setup
app.set('view engine', 'ejs');
// کۆدی نوێ
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'a-very-secret-key-for-ctf',
    resave: false,
    saveUninitialized: true,
}));

// ✅✅✅ چارەسەری کێشەکە لێرەدایە ✅✅✅
// دروستکردنی Middlewareـێک بۆ دڵنیابوون لە بوونی هەژماری ئەدمین
let isDbInitialized = false;
const ensureAdminExists = async (req, res, next) => {
    if (!isDbInitialized) {
        try {
            const adminUser = await kv.hgetall('user:admin');
            if (!adminUser) {
                await kv.hset('user:admin', {
                    password: 'ThisIsAStrongAdminPassword_YouCannotGuessIt:)',
                    profile_name: 'The Administrator'
                });
                console.log('Admin user created successfully in Vercel KV.');
            }
            isDbInitialized = true;
        } catch (error) {
            console.error("Database initialization failed:", error);
            // ئەگەر هەڵەیەک ڕوویدا، ڕێگە بە بەردەوامبوون نادەین
            return res.status(500).send("Failed to initialize database connection.");
        }
    }
    next(); // ئەگەر هەموو شتێک باش بوو، بەردەوام بە
};

// بەکارهێنانی Middlewareـەکە بۆ هەموو داواکارییەکان
app.use(ensureAdminExists);


// --- Routes ---

// 1. Login and Register Page
app.get('/', (req, res) => {
    if (req.session.username) {
        res.redirect('/dashboard');
    } else {
        res.render('index', { error: null });
    }
});

app.post('/auth', async (req, res) => {
    const { action, username, password } = req.body;

    if (!username || !password) {
        return res.render('index', { error: "Username and password are required." });
    }

    if (action === 'register') {
        const userExists = await kv.hgetall(`user:${username}`);
        if (userExists) {
            return res.render('index', { error: "This username already exists." });
        }
        await kv.hset(`user:${username}`, { password, profile_name: username });
        return res.render('index', { error: "Account created successfully. You can now log in." });
    }

    if (action === 'login') {
        const user = await kv.hgetall(`user:${username}`);
        if (user && password === user.password) {
            req.session.username = username;
            if (username === 'admin') {
                const flag = "CTF{C00k1e_M0nst3r_Is_H4ppy_Now}";
                res.cookie("admin_secret", flag, { maxAge: 3600000 });
            }
            return res.redirect('/dashboard');
        } else {
            return res.render('index', { error: "Invalid username or password." });
        }
    }
});

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
    if (!req.session.username) {
        res.redirect('/');
    } else {
        next();
    }
}

// 2. Dashboard Page
app.get('/dashboard', requireLogin, async (req, res) => {
    const currentUser = req.session.username;
    let viewingUser = currentUser;
    
    if (currentUser === 'admin' && req.query.view_user) {
        viewingUser = req.query.view_user;
    }

    const userData = await kv.hgetall(`user:${viewingUser}`);
    if (!userData) {
        return res.redirect('/dashboard');
    }

    let allUsers = null;
    if (currentUser === 'admin') {
        const userKeys = await kv.keys('user:*');
        allUsers = userKeys.map(key => key.replace('user:', ''));
    }

    res.render('dashboard', {
        currentUser,
        viewingUser,
        userData,
        allUsers,
        message: null
    });
});

app.post('/dashboard', requireLogin, async (req, res) => {
    const currentUser = req.session.username;
    const { new_name } = req.body;

    if (currentUser !== 'admin' && new_name) {
        const currentUserData = await kv.hgetall(`user:${currentUser}`);
        await kv.hset(`user:${currentUser}`, { ...currentUserData, profile_name: new_name });
    }
    res.redirect('/dashboard');
});

// 3. Submit Flag Page
app.get('/submit', requireLogin, (req, res) => {
    res.render('submit', { message: null, flag_correct: false });
});

app.post('/submit', requireLogin, (req, res) => {
    const correct_flag = "CTF{C00k1e_M0nst3r_Is_H4ppy_Now}";
    const { flag } = req.body;
    if (flag && flag.trim() === correct_flag) {
        res.render('submit', { message: "Congratulations! You have successfully completed the challenge.", flag_correct: true });
    } else {
        res.render('submit', { message: "Incorrect flag. Keep trying!", flag_correct: false });
    }
});

// 4. Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('admin_secret');
        res.redirect('/');
    });
});

module.exports = app;

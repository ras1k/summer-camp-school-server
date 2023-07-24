const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
    MongoClient,
    ServerApiVersion,
    ObjectId
} = require('mongodb');
require('dotenv').config();

const Stripe = require('stripe');
const stripe = Stripe(process.env.PAYMENT_SECRET_KEY);

const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

//jwt
const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'Unauthorized Access' })
    }

    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ error: true, message: 'Unauthorized Access' })
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iiyr61g.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        //collections
        const usersCollection = client.db("summerCampDB").collection("users");
        const coursesCollection = client.db("summerCampDB").collection("courses");
        const instructorsCollection = client.db("summerCampDB").collection("instructors");
        const cartCollection = client.db("summerCampDB").collection("carts");
        const classCollection = client.db("summerCampDB").collection("classes");
        const paymentCollection = client.db('summerCampDB').collection('payments');


        //jwt api
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token })
        })

        //users
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            console.log("existing user", existingUser);
            if (existingUser) {
                return res.send({ message: 'user already exist' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result)
        });

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' };
            res.send(result);
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)
        });


        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'instructor' };
            res.send(result);
        });

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)
        });

        //carts
        app.get('/carts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            console.log(email);
            if (!email) {
                res.send([])
            }
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result)
        });

        app.post('/carts', async (req, res) => {
            const courseItem = req.body;
            const result = await cartCollection.insertOne(courseItem);
            res.send(result)
        });

        app.get('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.findOne(query);
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })

        //courses
        app.get('/courses', async (req, res) => {
            const result = await coursesCollection.find().toArray();
            res.send(result)
        });

        //instructors
        app.get('/instructors', async (req, res) => {
            const result = await instructorsCollection.find().toArray();
            res.send(result)
        });

        //classes
        app.post('/classes', verifyJWT, async (req, res) => {
            const newItem = req.body;
            const result = await classCollection.insertOne(newItem);
            res.send(result)
        })

        app.get('/classes', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result)
        });

        app.patch('/classes/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: 'paid'
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result)
        });

        //payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        //payment
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);

            const query = { id: { $in: payment.cartItems.map(id => new ObjectId(id)) } };
            const deleteResult = await cartCollection.deleteMany(query)
            res.send({ result, deleteResult })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('School Server is running')
});

app.listen(port, () => {
    console.log(`School Server is running on port: ${port}`)
})
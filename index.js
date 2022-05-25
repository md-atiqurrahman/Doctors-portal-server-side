const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ldsyr.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
     try{
        await client.connect();

        const serviceCollection = client.db('doctors-portal').collection('service');

        app.get('/service', async (req, res)=>{
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })
     }
     finally{
        //  await client.close();
     }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Doctors server is running');
});

app.listen(port, () => {
    console.log('Doctors app listening on port', port)
})
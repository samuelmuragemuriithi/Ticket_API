// Import required modules
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, collection,getDocs } = require('firebase/firestore');
// const { getFirestore, collection, getDocs } = require('firebase/firestore');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = 3000;

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
};

// Initialize Firebase and Firestore
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Middleware for JSON response
app.use(express.json());

// Route table as landing page
app.get('/', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket API</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f9; color: #333; }
          .container { max-width: 800px; margin: 50px auto; padding: 20px; background: #ffffff; border-radius: 10px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1); }
          h1 { color: #4b39ef; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          table th, table td { padding: 12px; border: 1px solid #ddd; text-align: left; }
          table th { background-color: #4b39ef; color: white; }
          table a { color: #4b39ef; text-decoration: none; }
          table a:hover { text-decoration: underline; }
          footer { text-align: center; margin-top: 20px; font-size: 14px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Ticket API Route Table</h1>
          <table>
            <thead>
              <tr>
                <th>HTTP Method</th>
                <th>Route</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GET</td>
                <td><a href="/tickets">/tickets</a></td>
                <td>Returns all ticket details</td>
              </tr>
              <tr>
                <td>GET</td>
                <td><a href="/tickets/agents">/tickets/agents</a></td>
                <td>Aggregates ticket count by assigned agent</td>
              </tr>
              <tr>
                <td>GET</td>
                <td><a href="/agents">/agents</a></td>
                <td>Returns all agent details</td>
              </tr>
              <tr>
                <td>POST</td>
                <td><a href="/tickets/auto-assign">/tickets/auto-assign</a></td>
                <td>Auto-assigns tickets to available agents based on shift and queue</td>
              </tr>
            </tbody>
          </table>
          <footer>
            <p>Ticket API - 2024 | Developed with ❤️</p>
          </footer>
        </div>
      </body>
      </html>
    `);
});

// Function to fetch all tickets from Firestore
async function fetchTicketsFromFirestore() {
  const ticketsCollection = collection(db, 'TicketData');
  const querySnapshot = await getDocs(ticketsCollection);

  const tickets = [];
  querySnapshot.forEach((doc) => {
    tickets.push({ ticket_id: doc.id, ...doc.data() });
  });

  return tickets;
}

// API route to get all tickets
app.get('/tickets', async (req, res) => {
  try {
    console.log("Fetching data from Firestore...");
    console.log("Collection name: TicketData");

    const tickets = await fetchTicketsFromFirestore();
    res.json({ success: true, data: tickets });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ success: false, message: "Failed to fetch tickets from Firestore" });
  }
});

// Function to aggregate tickets by assigned agent
async function aggregateTicketsByAgent() {
  const tickets = await fetchTicketsFromFirestore();

  const agentTicketCount = {};

  tickets.forEach(ticket => {
    const assignedAgent = ticket.assigned_agent || 'Unassigned'; // Default to 'Unassigned' if no agent
    if (agentTicketCount[assignedAgent]) {
      agentTicketCount[assignedAgent]++;
    } else {
      agentTicketCount[assignedAgent] = 1;
    }
  });

  return agentTicketCount;
}

// API route to aggregate tickets by assigned agent
app.get('/tickets/agents', async (req, res) => {
  try {
    console.log("Aggregating ticket count by agent...");

    const agentTicketCount = await aggregateTicketsByAgent();
    res.json({ success: true, data: agentTicketCount });
  } catch (error) {
    console.error("Error aggregating ticket count by agent:", error);
    res.status(500).json({ success: false, message: "Failed to aggregate ticket count by agent" });
  }
});

// Function to fetch all agent data from Firestore
async function fetchAgentDataFromFirestore() {
  const agentsCollection = collection(db, 'AgentData');
  const querySnapshot = await getDocs(agentsCollection);

  const agents = [];
  querySnapshot.forEach((doc) => {
    agents.push({ agent_id: doc.id, ...doc.data() });
  });

  return agents;
}

// API route to get all agent data
app.get('/agents', async (req, res) => {
  try {
    console.log("Fetching agent data from Firestore...");
    console.log("Collection name: AgentData");

    const agents = await fetchAgentDataFromFirestore();
    res.json({ success: true, data: agents });
  } catch (error) {
    console.error("Error fetching agent data:", error);
    res.status(500).json({ success: false, message: "Failed to fetch agent data from Firestore" });
  }
});

// Function to auto-assign tickets based on agent availability and existing ticket load
async function autoAssignTickets() {
    const agents = await fetchAgentDataFromFirestore();
    const tickets = await fetchTicketsFromFirestore();
  
    const currentTime = Math.floor(Date.now() / 1000);  // Current timestamp in seconds
    const ticketQueue = [];
  
    // Find out which agents are available
    const availableAgents = agents.filter(agent => {
      return agent.shift_start.seconds <= currentTime && agent.shift_end.seconds > currentTime && agent.status !== 'Offline';
    });
  
    // Aggregate existing ticket count for each agent
    const agentTicketCount = {};
    tickets.forEach(ticket => {
      const assignedAgent = ticket.assigned_agent || 'Auto Assign'; 
      if (agentTicketCount[assignedAgent]) {
        agentTicketCount[assignedAgent]++;
      } else {
        agentTicketCount[assignedAgent] = 1;
      }
    });
  
    // Loop through tickets to assign them
    tickets.forEach(ticket => {
      let assignedAgent = ticket.assigned_agent;
  
      if (assignedAgent === 'Auto Assign') {
        if (availableAgents.length > 0) {
          availableAgents.sort((a, b) => {
            return (agentTicketCount[a.name] || 0) - (agentTicketCount[b.name] || 0);
          });
  
          assignedAgent = availableAgents[0].name;
  
          agentTicketCount[assignedAgent] = (agentTicketCount[assignedAgent] || 0) + 1;
        } else {
          assignedAgent = 'Auto Assign';
        }
      }
  
      // Queue the ticket with the assigned agent and status
      const ticketData = {
        title: ticket.title,
        due_date: new Date(ticket.due_date.seconds * 1000).toLocaleString(),  // Convert from seconds to readable date
        assigned_agent: assignedAgent,
        status: ticket.status || 'Pending'
      };
  
      ticketQueue.push(ticketData);
  
      // Save ticket to Firestore in the new collection
      saveAssignedTicketToFirestore(ticketData);
    });
  
    return ticketQueue;
  }
  
  // Function to save the ticket data to Firestore in a new collection
  async function saveAssignedTicketToFirestore(ticketData) {
    try {
      const ticketRef = doc(collection(db, 'AutoAssignedTickets')); // Reference to the new collection
      await setDoc(ticketRef, {
        title: ticketData.title,
        due_date: ticketData.due_date,
        assigned_agent: ticketData.assigned_agent,
        status: ticketData.status,
        assigned_at: new Date().toISOString()  // Timestamp when ticket is assigned
      });
      console.log(`Ticket saved to AutoAssignedTickets collection: ${ticketData.title}`);
    } catch (error) {
      console.error("Error saving ticket to Firestore:", error);
    }
  }
  
  // API route to auto-assign tickets
  app.post('/tickets/auto-assign', async (req, res) => {
    try {
      console.log("Auto-assigning tickets...");
  
      const ticketQueue = await autoAssignTickets();
      res.json({ success: true, data: ticketQueue });
    } catch (error) {
      console.error("Error auto-assigning tickets:", error);
      res.status(500).json({ success: false, message: "Failed to auto-assign tickets" });
    }
  });
  

// Start the server
app.listen(port, () => {
  console.log(`Ticket API server running at http://localhost:${port}`);
});

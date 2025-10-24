import React, { useState, useEffect, useRef } from "react";
import client, { createSession } from "./nakamaClient";

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [status, setStatus] = useState("Connecting...");
  const [mySymbol, setMySymbol] = useState<string>("");
  const socketRef = useRef<any>(null);
  const matchIdRef = useRef<any>(null);

  useEffect(() => {
    async function init() {
      try {
        // 1. Authenticate user
        const userSession: any = await createSession(
          "player_" + Math.floor(Math.random() * 10000)
        );
        setSession(userSession);
        setStatus("Authenticated...");

        // 2. Create socket and connect
        const socket = client.createSocket(false, false);
        console.log("CHECKING START", socket);
        await socket.connect(userSession);
        socketRef.current = socket;
        setStatus("Connected. Creating/Joining match...");

        // 3. Listen for match data (opponent moves)
        socket.onmatchdata = (matchData: any) => {
          console.log("CHECKING ON MATCH DATA", matchData);

          try {
            let boardUpdate;

            // Check if data is Uint8Array
            if (matchData.data instanceof Uint8Array) {
              const decodedString = new TextDecoder().decode(matchData.data);
              console.log("Decoded string:", decodedString);
              boardUpdate = JSON.parse(decodedString);
            } else if (typeof matchData.data === "string") {
              // If it's already a string, parse directly
              boardUpdate = JSON.parse(matchData.data);
            } else {
              console.error("Unknown data type:", typeof matchData.data);
              return;
            }

            setBoard(boardUpdate);
            setIsXNext((prev) => !prev);
            setStatus("Your turn!");
          } catch (error) {
            console.error("Error parsing match data:", error);
          }
        };

        // 4. Listen for match presence (when someone joins)
        socket.onmatchpresence = (presence: any) => {
          console.log("CHECKING PRESENCE", presence);
          if (presence.joins && presence.joins.length > 0) {
            // Someone joined - if we haven't been assigned a symbol yet, we must be the second player
            if (!mySymbol) {
              setMySymbol("O");

              setIsXNext(true); // X goes first, so isXNext should be true for player O initially
              setStatus("You are O. Waiting for X to move...");
            } else {
              // We already have a symbol (X), so someone else joined
              setIsXNext(true); // Reset to true when opponent joins
              setStatus("Opponent joined! You are X. Your turn!");
            }
          }

          if (presence.leaves && presence.leaves.length > 0) {
            setStatus("Opponent left the match");
          }
        };

        // 5. Try to create a match with a fixed name
        // This allows multiple clients to join the same match
        const MATCH_NAME = "tictactoe_room_1"; // Fixed room name

        try {
          // Try to create match
          const match = await socket.createMatch(MATCH_NAME);
          matchIdRef.current = match.match_id;
          setMySymbol("X"); // Creator is always X
          setIsXNext(true);
          setStatus(`Match created! You are X. Waiting for opponent...`);
        } catch (createError: any) {
          // If create fails, match already exists, so we join as player O
          console.log("Match already exists, joining as player O...");

          // Try to join the existing match
          try {
            const match = await socket.joinMatch(MATCH_NAME);
            matchIdRef.current = match.match_id;
            // Don't set symbol here - wait for onmatchpresence
            setStatus("Joined match! Waiting to be assigned symbol...");
          } catch (joinError: any) {
            // If join also fails, create a new match with random ID
            const match = await socket.createMatch();
            matchIdRef.current = match.match_id;
            setMySymbol("X");
            setIsXNext(true);
            setStatus(
              `Match created! Share this ID with opponent: ${match.match_id.slice(
                0,
                8
              )}...`
            );
          }
        }
      } catch (error: any) {
        console.error("Error initializing:", error);
        setStatus("Error: " + error.message);
      }
    }
    init();

    // Cleanup
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Handle local move & send to Nakama
  const handleClick = (index: number) => {
    if (!matchIdRef.current || board[index] || !isXNext) return;

    const newBoard = [...board];
    newBoard[index] = mySymbol;
    setBoard(newBoard);
    setIsXNext(false);
    setStatus("Opponent's turn...");

    // Send data: JSON stringify, then encode as Uint8Array
    const data = JSON.stringify(newBoard);
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);

    socketRef.current.send({
      match_data_send: {
        match_id: matchIdRef.current,
        op_code: 1,
        data: encodedData, // Send as Uint8Array
      },
    });
  };

  return (
    <div style={{ textAlign: "center", fontFamily: "sans-serif" }}>
      <h1>Tic Tac Toe</h1>
      <p>{status}</p>
      {mySymbol && (
        <p>
          You are: <strong>{mySymbol}</strong>
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 100px)",
          gap: "5px",
          justifyContent: "center",
        }}
      >
        {board.map((cell, i) => (
          <button
            key={i}
            onClick={() => handleClick(i)}
            style={{
              width: "100px",
              height: "100px",
              fontSize: "2rem",
              cursor: "pointer",
              backgroundColor: cell ? "#e0e0e0" : "white",
            }}
            disabled={!!cell || !isXNext}
          >
            {cell}
          </button>
        ))}
      </div>
      <p>Next Player: {isXNext ? mySymbol : mySymbol === "X" ? "O" : "X"}</p>
    </div>
  );
};

export default App;

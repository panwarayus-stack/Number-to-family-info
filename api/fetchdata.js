export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: '❌ Method not allowed' 
    });
  }

  try {
    const { number } = req.query;

    if (!number) {
      return res.status(400).send('📱 Mobile number is required. Usage: /api/fetchdata?number=MOBILE_NUMBER');
    }

    // Validate mobile number format
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(number)) {
      return res.status(400).send('❌ Invalid mobile number format. Please provide a valid 10-digit Indian mobile number.');
    }

    // Step 1: Get mobile info from first API
    const mobileApiUrl = `https://allapiinone.vercel.app/?key=DEMOKEY&type=mobile&term=${number}`;
    
    const mobileResponse = await fetch(mobileApiUrl);
    
    if (!mobileResponse.ok) {
      return res.status(200).send('📱 Service is currently unavailable. Please try again later.');
    }

    const mobileData = await mobileResponse.json();

    if (!mobileData.success || !mobileData.result || mobileData.result.length === 0) {
      return res.status(200).send('📭 No information found for this mobile number.');
    }

    const usersData = mobileData.result;
    let familyData = null;
    let successfulUserData = null;

    // Try each user until we get successful family data
    for (const userData of usersData) {
      const aadhaarNumber = userData.id_number;

      if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
        continue;
      }

      try {
        // Step 2: Get family info from second API
        const familyApiUrl = `https://adhar-family.vercel.app/fetch?key=paidchx&aadhaar=${aadhaarNumber}`;
        
        const familyResponse = await fetch(familyApiUrl);
        
        if (!familyResponse.ok) continue;

        const familyResponseData = await familyResponse.json();

        // Check if we have valid family data
        if (familyResponseData.respCode === "214" || 
            familyResponseData.respMessage === "Ration card not found in IMPDS" ||
            !familyResponseData.memberDetailsList) {
          continue;
        }

        // Success - we found family data
        familyData = familyResponseData;
        successfulUserData = userData;
        break;

      } catch (error) {
        continue;
      }
    }

    // If no family data found
    if (!familyData) {
      return res.status(200).send('👨‍👩‍👧‍👦 Family data not found for this mobile number.');
    }

    // Format and return complete family data
    const formattedText = formatCompleteFamilyData(familyData, number);
    return res.status(200).send(formattedText);

  } catch (error) {
    return res.status(200).send('❌ Service temporarily unavailable. Please try again later.');
  }
}

// Format complete family data
function formatCompleteFamilyData(familyData, searchedNumber) {
  // Get relationship emoji
  const getRelationshipEmoji = (relationship) => {
    const emojiMap = {
      'SELF': '👤',
      'HUSBAND': '👨',
      'WIFE': '👩',
      'SON': '👦',
      'DAUGHTER': '👧',
      'FATHER': '👴',
      'MOTHER': '👵',
      'BROTHER': '👨',
      'SISTER': '👩',
      'GRANDFATHER': '👴',
      'GRANDMOTHER': '👵'
    };
    return emojiMap[relationship] || '👤';
  };

  // Format family members with proper spacing
  const familyMembers = familyData.memberDetailsList.map(member => {
    const emoji = getRelationshipEmoji(member.releationship_name);
    return `${emoji} ${member.memberName.trim()} (${member.releationship_name}) ${member.uid === 'Yes' ? '✅' : '❌'}`;
  }).join('\n');

  // Get Indian time
  const indianTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'medium'
  });

  return `
👨‍👩‍👧‍👦 FAMILY DETAILS

📍 Family Address: ${familyData.address}
🏛️ District: ${familyData.homeDistName}
🗺️ State: ${familyData.homeStateName}
📮 Pincode: ${extractPincode(familyData.address)}
📋 Scheme: ${familyData.schemeName || 'Not available'}
👥 Total Family Members: ${familyData.memberDetailsList.length} members

👪 FAMILY MEMBERS LIST

${familyMembers}

📊 SEARCH SUMMARY

🔍 Mobile Searched: ${searchedNumber}
👪 Total Family Members: ${familyData.memberDetailsList.length} members
⏰ Search Timestamp: ${indianTime}
`.trim();
}

// Helper function to extract pincode from address
function extractPincode(address) {
  if (!address) return 'Not available';
  const pincodeMatch = address.match(/\b\d{6}\b/);
  return pincodeMatch ? pincodeMatch[0] : 'Not available';
}
